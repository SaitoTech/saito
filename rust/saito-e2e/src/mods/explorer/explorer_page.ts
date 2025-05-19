import { Page } from "@playwright/test";
import ModulePage from "../module_page";

export default class ExplorerPage extends ModulePage {
    constructor(page: Page) {
        super(page, "/explorer");
    }
    async getLatestBlockHash() {

    }
    async getLatestBlockId() { }
    async getLatestBlockPicture(): Promise<{
        id: number,
        hash: string,
    }[]> {
        throw new Error("NotImplemented");
    }
}