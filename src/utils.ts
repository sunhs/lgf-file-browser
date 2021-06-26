import { commands, FileStat, FileType, Uri, workspace } from "vscode";


export enum States {
    // setting these to true means that actions from file browser
    // are allowed, e.g., `goUp`, `goHome`
    inLgfFileBrowser = "inLgfFileBrowser",
    lgfFileBrowserEmpty = "lgfFileBrowserEmpty",

    // setting this to true means that actions from project manager
    // are allowed, e.g., `confirmAddProject`
    inLgfProjMgr = "inLgfProjMgr",

    // currently unused
    projMgrAddProj = "lgfProjMgrAddProj",
    projMgrOpenProj = "lgfProjMgrOpenProj",
    projMgrFindFileFromProj = "lgfProjMgrFindFileFromProj",
    projMgrFindFileFromWSProj = "lgfProjMgrFindFileFromWSProj",
    projMgrFindFileFromCurProj = "lgfProjMgrFindFileFromCurProj",
    projMgrDelProjFromWS = "lgfProjMgrDelProjFromWS"
}


export function setContext(context: string, value: boolean) {
    commands.executeCommand("setContext", context, value);
}

export async function isDir(filePath: string): Promise<boolean> {
    let stat = await workspace.fs.stat(Uri.file(filePath));
    return isDirType(stat.type);
}


export function isDirType(fileType: FileType): boolean {
    return (fileType & FileType.Directory) === FileType.Directory;
}


export class FixSizedMap<K, V> {
    private data: Map<K, V>;
    private maxEntries: number;

    constructor(maxEntries: number) {
        this.data = new Map<K, V>();
        this.maxEntries = maxEntries;
    }

    public has(key: K): boolean {
        return this.data.has(key);
    }

    public get(key: K): V | undefined {
        return this.data.get(key);
    }

    public set(key: K, value: V) {
        if (this.data.has(key)) {
            this.data.delete(key);
        } else if (this.data.size >= this.maxEntries) {
            this.data.delete(this.data.keys().next().value);
        }

        this.data.set(key, value);
    }
}


// use Map's property of ordered insertion to build an LRU cache
export class LruCache<T> {
    private data: Map<T, number>;
    private maxEntries: number;

    constructor(maxEntries: number) {
        this.data = new Map<T, number>();
        this.maxEntries = maxEntries;
    }

    public get(key: T): number {
        let data = this.data.get(key);
        return data !== undefined ? data : -1;
    }

    public put(key: T) {
        let keyToDelete: T | undefined;
        if (this.data.has(key)) {
            keyToDelete = key;
        } else if (this.data.size >= this.maxEntries) {
            keyToDelete = this.data.keys().next().value;
        }

        if (keyToDelete) {
            let keys = this.data.keys();
            while (true) {
                if (keys.next().value === keyToDelete) {
                    break;
                }
            }
            for (let k of keys) {
                this.data.set(k, this.data.get(k)! - 1);
            }
            this.data.delete(key);
        }

        this.data.set(key, this.data.size);
    }

    public getData(): Map<T, number> {
        return this.data;
    }
}