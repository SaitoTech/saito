// let registry = new FinalizationRegistry((heldValue: any) => {
//   heldValue.free();
// });


export default class WasmWrapper<T> {
  public instance: T;

  // private static createdCounter = 0;
  // private static deletedCounter = 0;
  private static registry = new FinalizationRegistry((value: any) => {
    // WasmWrapper.deletedCounter++;
    // console.log(`deleted : ${WasmWrapper.deletedCounter} created : ${WasmWrapper.createdCounter} ptr : ${value.__wbg_ptr}`);
    // @ts-ignore
    if (value && !!value.__wbg_ptr) {
      value.free();
    }
  });

  constructor(instance: T) {
    this.instance = instance;
    WasmWrapper.registry.register(this, instance);
    // WasmWrapper.createdCounter++;
  }


  // free() {
  //   // @ts-ignore
  //   this.instance.free();
  // }
}