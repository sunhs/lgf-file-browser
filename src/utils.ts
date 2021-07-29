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
export class WeightedLruCache<T> {
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


class LinkedListNode<K, V> {
    prev?: LinkedListNode<K, V> = undefined;
    next?: LinkedListNode<K, V> = undefined;
    key?: K = undefined;
    value?: V = undefined;

    constructor(prev?: LinkedListNode<K, V>, next?: LinkedListNode<K, V>, key?: K, value?: V) {
        this.prev = prev;
        this.next = next;
        this.key = key;
        this.value = value;
    }
}


enum MapGetType {
    key = "key",
    value = "value",
    entry = "entry"
}

export class LruMap<K, V> {
    size: number;
    private capacity: number;
    private indexMap: Map<K, LinkedListNode<K, V>>;
    private head: LinkedListNode<K, V>;
    private tail: LinkedListNode<K, V>;

    constructor(maxEntries: number) {
        this.size = 0;
        this.capacity = maxEntries;
        this.indexMap = new Map<K, LinkedListNode<K, V>>();
        this.head = new LinkedListNode<K, V>();
        this.tail = new LinkedListNode<K, V>();
        this.head.next = this.tail;
        this.tail.prev = this.head;
    }

    public get(key: K): V | undefined {
        if (!this.indexMap.has(key)) {
            return undefined;
        }

        let node = this.indexMap.get(key)!;
        this.moveNodeToHead(node);
        return node.value;
    }

    public set(key: K, value: V): this {
        if (this.get(key)) {
            this.indexMap.get(key)!.value = value;
            return this;
        }

        let node = new LinkedListNode<K, V>(this.head, this.head.next!, key, value);
        this.head.next!.prev = node;
        this.head.next = node;
        this.indexMap.set(key, node);

        if (this.indexMap.size > this.capacity) {
            this.indexMap.delete(this.tail.prev!.key!);
            this.deleteNode(this.tail.prev!);
        }

        this.size = this.indexMap.size;
        return this;
    }

    delete(key: K): boolean {
        let node = this.indexMap.get(key);
        if (node) {
            this.deleteNode(node);
        }
        let deleted = this.indexMap.delete(key);
        this.size = this.indexMap.size;
        return deleted;
    }

    has(key: K): boolean {
        return this.indexMap.has(key);
    }

    clear() {
        this.indexMap.clear();
        this.size = this.indexMap.size;
        this.head.next = this.tail;
        this.tail.prev = this.head;
    }

    keys(): K[] {
        let keys: K[] = [];
        let node = this.head.next!;
        while (node.next) {
            if (this.indexMap.has(node.key!)) {
                keys.push(node.key!);
            }
            node = node.next;
        }
        return keys;
    }

    values(): V[] {
        let values: V[] = [];
        let node = this.head.next!;
        while (node.next) {
            if (this.indexMap.has(node.key!)) {
                values.push(node.value!);
            }
            node = node.next;
        }
        return values;
    }

    entries(): [K, V][] {
        let entries: [K, V][] = [];
        let node = this.head.next!;
        while (node.next) {
            if (this.indexMap.has(node.key!)) {
                entries.push([node.key!, node.value!]);
            }
            node = node.next;
        }
        return entries;
    }

    moveNodeToHead(node: LinkedListNode<K, V>) {
        node.prev!.next = node.next;
        node.next!.prev = node.prev;
        node.prev = this.head;
        node.next = this.head.next;
        this.head.next!.prev = node;
        this.head.next = node;
    }

    deleteNode(node: LinkedListNode<K, V>) {
        node.prev!.next = node.next;
        node.next!.prev = node.prev;
        node.prev = undefined;
        node.next = undefined;
    }
}


// class LruMapIterator<K, V> implements Iterator<[K, V]> {
//     private indexMap: Map<K, LinkedListNode<K, V>>;
//     private head: LinkedListNode<K, V>;
//     private tail: LinkedListNode<K, V>;

//     constructor(index: Map<K, LinkedListNode<K, V>>, head: LinkedListNode<K, V>, tail: LinkedListNode<K, V>) {
//         this.indexMap = index;
//         this.head = head;
//         this.tail = tail;
//     }
// }