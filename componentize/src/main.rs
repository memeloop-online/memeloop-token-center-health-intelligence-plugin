fn main() -> Result<(), Box<dyn std::error::Error>> {
    let module = std::fs::read("target/wasm32-unknown-unknown/release/mtc_health_component.wasm")?;
    let bytes = wit_component::ComponentEncoder::default().module(&module)?.validate(true).encode()?;
    std::fs::write("plugin.wasm", bytes)?;
    Ok(())
}
