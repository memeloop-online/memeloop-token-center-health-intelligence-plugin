//! Official transient-health policy for MemeLoop Token Center group routing v2.
//! The component is a pure, credential-free policy function: it has no network,
//! KV, clock, request-body, authorization, or account-discovery capability.

wit_bindgen::generate!({ path: "wit/token-center.wit", world: "group-routing-plugin" });

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

const MAX_JSON_BYTES: usize = 1024 * 1024;
const MAX_CANDIDATES: usize = 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum TransientHealthMode {
    Shadow,
    Active,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Configuration {
    transient_health_mode: TransientHealthMode,
    min_samples: u32,
    open_micros: u32,
    recover_micros: u32,
    min_probe_successes: u32,
    cooldown_ms: u64,
    recovery_wait_ms: u64,
    recheck_ms: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Health {
    Healthy,
    Transient,
    HardQuota,
    Authentication,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct TransientSignal {
    sample_count: u64,
    ewma_micros: u32,
    last_observed_at: i64,
    recovery_successes: u64,
    revision: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Candidate {
    tenant_id: String,
    route_id: String,
    account_id: String,
    generation: u64,
    health: Health,
    transient_signal: TransientSignal,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PlanInput {
    tenant_id: String,
    seed: u64,
    remaining_deadline_ms: u64,
    config: Configuration,
    candidates: Vec<Candidate>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Outcome {
    Success,
    TransientFailure,
    HardQuota,
    Authentication,
    Cancelled,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ObserveInput {
    tenant_id: String,
    seed: u64,
    remaining_deadline_ms: u64,
    config: Configuration,
    candidate: Candidate,
    outcome: Outcome,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum PolicyMode {
    Shadow,
    Active,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
struct TransientPolicy {
    mode: PolicyMode,
    min_samples: u32,
    open_micros: u32,
    recover_micros: u32,
    min_probe_successes: u32,
}

#[derive(Debug, Serialize)]
struct Directive {
    tenant_id: String,
    route_id: String,
    account_id: String,
    generation: u64,
    allow_transient_probe: bool,
    cooldown_ms: u64,
    recovery_wait_ms: u64,
    recheck_ms: u64,
    stickiness: bool,
    transient_policy: TransientPolicy,
}

#[derive(Debug, Serialize)]
struct Plan {
    candidates: Vec<Directive>,
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty() && value.len() <= 128 && !value.chars().any(char::is_control)
}

fn validate_configuration(config: &Configuration) -> Result<(), String> {
    if !(1..=10_000).contains(&config.min_samples)
        || config.open_micros > 1_000_000
        || config.recover_micros > config.open_micros
        || !(1..=64).contains(&config.min_probe_successes)
        || config.cooldown_ms > 60_000
        || config.recovery_wait_ms > 300_000
        || !(25..=5_000).contains(&config.recheck_ms)
    {
        return Err("invalid transient health configuration".into());
    }
    Ok(())
}

fn validate_signal(signal: &TransientSignal) -> Result<(), String> {
    if signal.ewma_micros > 1_000_000 || signal.last_observed_at < 0 {
        return Err("invalid transient health signal".into());
    }
    // The component never treats counters as authority. Reading them here
    // keeps strict decoding explicit while the host owns persistence/fencing.
    let _ = (
        signal.sample_count,
        signal.recovery_successes,
        signal.revision,
    );
    Ok(())
}

fn validate_candidate(candidate: &Candidate, tenant_id: &str) -> Result<(), String> {
    if candidate.tenant_id != tenant_id
        || !valid_identifier(&candidate.tenant_id)
        || !valid_identifier(&candidate.route_id)
        || !valid_identifier(&candidate.account_id)
    {
        return Err("invalid routing candidate identity".into());
    }
    validate_signal(&candidate.transient_signal)
}

fn transient_policy(config: &Configuration) -> TransientPolicy {
    TransientPolicy {
        mode: match config.transient_health_mode {
            TransientHealthMode::Shadow => PolicyMode::Shadow,
            TransientHealthMode::Active => PolicyMode::Active,
        },
        min_samples: config.min_samples,
        open_micros: config.open_micros,
        recover_micros: config.recover_micros,
        min_probe_successes: config.min_probe_successes,
    }
}

fn plan_directive(
    candidate: Candidate,
    config: &Configuration,
    remaining_deadline_ms: u64,
) -> Directive {
    let core_owned_hard_state =
        matches!(candidate.health, Health::HardQuota | Health::Authentication);
    Directive {
        tenant_id: candidate.tenant_id,
        route_id: candidate.route_id,
        account_id: candidate.account_id,
        generation: candidate.generation,
        allow_transient_probe: candidate.health == Health::Transient,
        cooldown_ms: if core_owned_hard_state {
            0
        } else {
            config.cooldown_ms
        },
        recovery_wait_ms: if core_owned_hard_state {
            0
        } else {
            config.recovery_wait_ms.min(remaining_deadline_ms)
        },
        recheck_ms: if core_owned_hard_state {
            0
        } else {
            config.recheck_ms
        },
        stickiness: false,
        transient_policy: transient_policy(config),
    }
}

fn observe_directive(input: ObserveInput) -> Directive {
    let core_owned_hard_state =
        matches!(input.outcome, Outcome::HardQuota | Outcome::Authentication)
            || matches!(
                input.candidate.health,
                Health::HardQuota | Health::Authentication
            );
    // Observe is terminal: it never waits, admits a probe, replays, or changes
    // ordering. The host uses only the frozen policy and bounded cooldown for
    // future requests, and rejects any changed transient policy.
    Directive {
        tenant_id: input.candidate.tenant_id,
        route_id: input.candidate.route_id,
        account_id: input.candidate.account_id,
        generation: input.candidate.generation,
        allow_transient_probe: false,
        cooldown_ms: if core_owned_hard_state {
            0
        } else {
            input.config.cooldown_ms
        },
        recovery_wait_ms: 0,
        recheck_ms: 0,
        stickiness: false,
        transient_policy: transient_policy(&input.config),
    }
}

fn plan(input_json: &str) -> Result<String, String> {
    if input_json.len() > MAX_JSON_BYTES {
        return Err("routing input exceeds its bound".into());
    }
    let input: PlanInput =
        serde_json::from_str(input_json).map_err(|_| "invalid group-routing-v2 input")?;
    validate_configuration(&input.config)?;
    if input.remaining_deadline_ms == 0
        || input.candidates.len() > MAX_CANDIDATES
        || !valid_identifier(&input.tenant_id)
    {
        return Err("invalid group-routing-v2 input".into());
    }
    let mut identities = BTreeSet::new();
    for candidate in &input.candidates {
        validate_candidate(candidate, &input.tenant_id)?;
        if !identities.insert((
            candidate.route_id.clone(),
            candidate.account_id.clone(),
            candidate.generation,
        )) {
            return Err("duplicate routing candidate identity".into());
        }
    }
    // Preserve the host's already-authorized native order exactly. This
    // package contributes health behavior, not selection authority.
    let _ = input.seed;
    let candidates = input
        .candidates
        .into_iter()
        .map(|candidate| plan_directive(candidate, &input.config, input.remaining_deadline_ms))
        .collect();
    serde_json::to_string(&Plan { candidates }).map_err(|_| "invalid routing output".into())
}

fn observe(input_json: &str) -> Result<String, String> {
    if input_json.len() > MAX_JSON_BYTES {
        return Err("routing input exceeds its bound".into());
    }
    let input: ObserveInput =
        serde_json::from_str(input_json).map_err(|_| "invalid group-routing-v2 observation")?;
    validate_configuration(&input.config)?;
    if !valid_identifier(&input.tenant_id) {
        return Err("invalid group-routing-v2 observation".into());
    }
    validate_candidate(&input.candidate, &input.tenant_id)?;
    let _ = (input.seed, input.remaining_deadline_ms);
    serde_json::to_string(&observe_directive(input)).map_err(|_| "invalid routing output".into())
}

struct TransientHealth;

impl exports::memeloop::token_center::group_routing_v1::Guest for TransientHealth {
    fn plan(input_json: String) -> Result<String, String> {
        plan(&input_json)
    }

    fn observe(input_json: String) -> Result<String, String> {
        observe(&input_json)
    }
}

#[cfg(target_arch = "wasm32")]
export!(TransientHealth);

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn config(mode: &str) -> Value {
        json!({
            "transient_health_mode": mode,
            "min_samples": 2,
            "open_micros": 900000,
            "recover_micros": 600000,
            "min_probe_successes": 2,
            "cooldown_ms": 5000,
            "recovery_wait_ms": 1000,
            "recheck_ms": 100
        })
    }

    fn candidate(route: &str, health: &str) -> Value {
        json!({
            "tenant_id": "tenant",
            "route_id": route,
            "account_id": format!("account-{route}"),
            "generation": 7,
            "health": health,
            "transient_signal": {
                "sample_count": 2,
                "ewma_micros": 1000000,
                "last_observed_at": 42,
                "recovery_successes": 0,
                "revision": 2
            }
        })
    }

    fn plan_value(mode: &str, remaining: u64) -> Value {
        json!({
            "tenant_id": "tenant",
            "seed": 9,
            "remaining_deadline_ms": remaining,
            "config": config(mode),
            "candidates": [
                candidate("healthy", "healthy"),
                candidate("transient", "transient"),
                candidate("hard", "hard_quota")
            ]
        })
    }

    #[test]
    fn plan_is_an_exact_ordered_permutation_with_bounded_health_advice() {
        let output: Value =
            serde_json::from_str(&plan(&plan_value("shadow", 250).to_string()).unwrap()).unwrap();
        let directives = output["candidates"].as_array().unwrap();
        assert_eq!(directives.len(), 3);
        assert_eq!(directives[0]["route_id"], "healthy");
        assert_eq!(directives[1]["route_id"], "transient");
        assert_eq!(directives[2]["route_id"], "hard");
        assert_eq!(directives[0]["recovery_wait_ms"], 250);
        assert_eq!(directives[1]["allow_transient_probe"], true);
        assert_eq!(directives[2]["allow_transient_probe"], false);
        assert_eq!(directives[2]["cooldown_ms"], 0);
        assert_eq!(directives[2]["recovery_wait_ms"], 0);
        assert_eq!(directives[0]["transient_policy"]["mode"], "shadow");
    }

    #[test]
    fn active_mode_emits_the_exact_short_window_policy() {
        let output: Value =
            serde_json::from_str(&plan(&plan_value("active", 1000).to_string()).unwrap()).unwrap();
        assert_eq!(
            output["candidates"][0]["transient_policy"],
            json!({
                "mode": "active",
                "min_samples": 2,
                "open_micros": 900000,
                "recover_micros": 600000,
                "min_probe_successes": 2
            })
        );
    }

    #[test]
    fn observation_is_terminal_and_preserves_the_frozen_policy() {
        let request = json!({
            "tenant_id": "tenant",
            "seed": 9,
            "remaining_deadline_ms": 0,
            "config": config("active"),
            "candidate": candidate("transient", "transient"),
            "outcome": "success"
        });
        let output: Value = serde_json::from_str(&observe(&request.to_string()).unwrap()).unwrap();
        assert_eq!(output["allow_transient_probe"], false);
        assert_eq!(output["recovery_wait_ms"], 0);
        assert_eq!(output["recheck_ms"], 0);
        assert_eq!(output["transient_policy"]["mode"], "active");
    }

    #[test]
    fn malformed_or_ambiguous_input_fails_closed() {
        let mut bad = plan_value("active", 1000);
        bad["config"]["recover_micros"] = json!(900001);
        assert!(plan(&bad.to_string()).is_err());

        bad = plan_value("active", 1000);
        bad["candidates"][1] = bad["candidates"][0].clone();
        assert!(plan(&bad.to_string()).is_err());

        bad = plan_value("active", 1000);
        bad["unexpected"] = json!(true);
        assert!(plan(&bad.to_string()).is_err());

        bad = plan_value("active", 1000);
        bad["candidates"][0]["transient_signal"]["ewma_micros"] = json!(1000001);
        assert!(plan(&bad.to_string()).is_err());
    }
}
