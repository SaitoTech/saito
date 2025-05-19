// // @ts-ignore
// import {expect} from "chai";
// import SaitoJs from "../index";
//
//
// describe('setup test', function () {
//     it('should load the wasm lib correctly', async function () {
//         console.log("loading...");
//
//         // // @ts-ignore
//         // const s = await import("saito-wasm/dist/server");
//         // // @ts-ignore
//         //
//         // console.log("s = ", s);
//         // // @ts-ignore
//         // let s1 = await s;
//         // console.log("s1 = ", s1);
//         // // @ts-ignore
//         // let saito = s1.default;
//         // // console.log("s2 = ", saito);
//         //
//         // expect(saito).to.exist;
//         // // let s = await saito.default;
//         // // console.log(s);
//         // console.log("lib test 2 = ", saito);
//         let result = await SaitoJs.initialize();
//         expect(result).to.equal("initialized");
//
//         let saito = SaitoJs.getInstance();
//
//         expect(saito).to.exist;
//         expect(saito.get_public_key).to.exist;
//         expect(saito.get_public_key()).to.equal("publickey");
//     });
// });
