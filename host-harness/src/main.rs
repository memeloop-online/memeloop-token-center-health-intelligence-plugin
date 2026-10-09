use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::{Value,json};
use wasmtime::{Engine,Store,Config};
use wasmtime::component::{Component,Linker,HasSelf};
wasmtime::component::bindgen!({ path: "../wit", world: "service-data-plugin" });
struct State { fail: bool, calls: usize }
impl memeloop::token_center::host::Host for State {
    fn log(&mut self,_:String,_:String) {}
    fn kv_get(&mut self,_:String)->Result<Option<Vec<u8>>,String>{ Err("unexpected KV".into()) }
    fn kv_put(&mut self,_:String,_:Vec<u8>)->Result<(),String>{ Err("unexpected KV".into()) }
    fn http_request(&mut self,method:String,url:String,headers:String,body:Vec<u8>)->Result<Vec<u8>,String>{
        self.calls+=1;
        assert_eq!(method,"GET");
        assert!(body.is_empty());
        let headers: Value=serde_json::from_str(&headers).unwrap();
        assert_eq!(headers.as_object().unwrap().len(),2);
        assert!(headers.get("authorization").is_none());
        let config:Value=serde_json::from_str(include_str!("../../component/sources.json")).unwrap();
        let source=config["sources"].as_array().unwrap().iter().find(|s| s["endpoint"]==url || s["robotsUrl"]==url).expect("exact approved URL");
        let robots=source["robotsUrl"]==url;
        let bytes=if robots { b"User-agent: *\nAllow: /\n".to_vec() }
            else { std::fs::read(format!("test/fixtures/{}.json",source["source"].as_str().unwrap())).unwrap() };
        Ok(serde_json::to_vec(&json!({"status":if self.fail {503} else {200},
            "headers":{"content-type":if robots {"text/plain"} else {"application/json"},"date":"Mon, 07 Sep 2026 07:44:00 GMT"},
            "body_base64":STANDARD.encode(bytes)})).unwrap())
    }
}
fn main()->Result<(),Box<dyn std::error::Error>>{
    let mut config=Config::new();
    config.wasm_component_model(true);
    config.consume_fuel(true);
    let engine=Engine::new(&config)?;
    let component=Component::from_file(&engine,"plugin.wasm")?;
    let mut linker=Linker::<State>::new(&engine);
    ServiceDataPlugin::add_to_linker::<_,HasSelf<_>>(&mut linker,|s|s)?;
    let mut store=Store::new(&engine,State{fail:false,calls:0});
    store.set_fuel(100_000_000)?;
    let bindings=ServiceDataPlugin::instantiate(&mut store,&component,&linker)?;
    let guest=bindings.memeloop_token_center_service_data_v1();
    let input=include_str!("../../component/sources.json");
    let collected=guest.call_collect(&mut store,"health-three-source-v1",input)?.expect("real component collect");
    assert_eq!(store.data().calls,6);
    let normalized=guest.call_normalize(&mut store,"health-snapshot-v1",input,&collected)?.expect("real component normalize");
    let snapshot:Value=serde_json::from_str(&normalized)?;
    assert_eq!(snapshot["sources"].as_array().unwrap().len(),3);
    assert!(snapshot["sources"].as_array().unwrap().iter().all(|s|!s["rows"].as_array().unwrap().is_empty()));
    std::fs::write("component-snapshot.json",normalized)?;
    assert!(guest.call_collect(&mut store,"health-three-source-v1","{}")?.is_err());
    assert_eq!(store.data().calls,6);
    assert!(guest.call_normalize(&mut store,"health-snapshot-v1",input,"[]")?.is_err());
    store.data_mut().fail=true;
    let failure=guest.call_collect(&mut store,"health-three-source-v1",input)?.unwrap_err();
    assert_eq!(failure,"http_status");
    assert_eq!(store.data().calls,7);
    println!("actual Wasmtime component: three sources, signed config rejection, HTTP failure, no retries");
    Ok(())
}
