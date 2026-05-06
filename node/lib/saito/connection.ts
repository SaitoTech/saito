import { EventEmitter } from 'events';

class Connection extends EventEmitter {

  public setMaxListeners: any;

  constructor() {
    super();

    //
    // 200 should be sufficient (default is 10)
    //
    // note -- it is easy to create hundreds of listeners here if someone
    // does app.connection.on() in a render function that gets called repeatedly
    //
    this.setMaxListeners(200);

    //
    // This code should be enabled occasionally just to do a sanity check on
    // the number of listeners or as a way of doing debugging in case we
    // start to go beyond 200 totalListeners
    //
    // setInterval(() => {
    //   // console.log("***** app.connection listener counts *****");
    //   let totalListeners = 0;
    //   this.eventNames().forEach((eventName, i) => {
    //     let eventCount = this.listenerCount(eventName);
    //     totalListeners += eventCount;
    //     //console.log(`app.connection has ${eventCount} listeners for ${eventName}`);
    //   });
    //   console.log(`app.connection has ${totalListeners} listeners`);
    // }, 1000);
  }
}

export default Connection;
