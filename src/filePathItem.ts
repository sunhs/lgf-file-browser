import { QuickPickItem, FileType, CancellationError, window, workspace, Uri, RelativePattern } from "vscode";
import * as PathLib from "path";
import * as OS from "os";
import * as fs from "fs";
import { FixSizedMap, LruCache } from "./utils";


const FILE_CACHE_MAX_SIZE = 200;
const LRU_MAX_SIZE = 20;

export class FilePathItem implements QuickPickItem {
    absPath: string;
    show: boolean = true;
    description?: string;
    detail?: string;
    fileType: FileType;
    label: string;

    constructor(path: string, fileType: FileType) {
        if (!PathLib.isAbsolute(path)) {
            let err = new CancellationError();
            err.message = `path ${path} is not absolute`;
            throw err;
        }
        this.absPath = path;

        this.fileType = fileType;
        let baseName = PathLib.basename(path);
        switch (this.fileType) {
            case FileType.Directory:
                this.label = `$(folder) ${baseName}`;
                break;
            case FileType.Directory | FileType.SymbolicLink:
                this.label = `$(file-symlink-directory) ${baseName}`;
                break;
            case FileType.File | FileType.SymbolicLink:
                this.label = `$(file-symlink-file) ${baseName}`;
            default:
                this.label = `$(file) ${baseName}`;
                break;
        }
    }
}


// map file path to project file item
let FILE_ITEM_CACHE = new FixSizedMap<string, ProjectFileItem>(FILE_CACHE_MAX_SIZE);
// map project name to LRU cache
let PROJECT_FILE_LRU_CACHE = new Map<string, LruCache<string>>();


export function getFileItemFromCache(filePath: string): ProjectFileItem | undefined {
    return FILE_ITEM_CACHE.get(filePath);
}


export function loadRecentHistoryLog(logFile: string) {
    let content = fs.readFileSync(logFile, "utf8");
    let log: { [key: string]: string[] } = JSON.parse(content);
    Object.entries(log).forEach(
        ([projectName, filePaths]) => {
            let cache = new LruCache<string>(LRU_MAX_SIZE);
            for (let filePath of filePaths) {
                cache.put(filePath);
            }
            PROJECT_FILE_LRU_CACHE.set(projectName, cache);
        }
    );
}


export function saveRecentHistorLog(logFile: string) {
    let jsonObj: { [key: string]: string[] } = {};
    PROJECT_FILE_LRU_CACHE.forEach(
        (cache, projectName) => {
            jsonObj[projectName] = [];
            for (let filePath of cache.getData().keys()) {
                jsonObj[projectName].push(filePath);
            }
        }
    );
    fs.writeFileSync(logFile, JSON.stringify(jsonObj));
}


export function updateRecentHistoryLog(projectName: string, filePath: string) {
    if (!PROJECT_FILE_LRU_CACHE.has(projectName)) {
        PROJECT_FILE_LRU_CACHE.set(projectName, new LruCache<string>(LRU_MAX_SIZE));
    }
    PROJECT_FILE_LRU_CACHE.get(projectName)!.put(filePath);
}


export class ProjectItem implements QuickPickItem {
    description: string;
    label: string;
    absProjectRoot: string;

    constructor(projectRoot: string) {
        this.label = PathLib.basename(projectRoot);
        this.description = projectRoot.replace(OS.homedir(), "~");
        this.absProjectRoot = projectRoot;
    }

    async getFileItems(excludeGlobPattern: RelativePattern): Promise<ProjectFileItem[] | undefined> {
        let status = this.intoWorkspace();

        if (!status) {
            return undefined;
        }

        let includeGlobPattern = new RelativePattern(this.absProjectRoot, "**");
        return workspace.findFiles(includeGlobPattern, excludeGlobPattern).then(
            /*
             * Weird thing.
             * When this is the first project added to the workspace, `uris` will be empty.
             */
            (uris) => {
                if (uris.length === 0) {
                    // this.dispose();
                    return undefined;
                }

                let fileItems: ProjectFileItem[] = [];

                uris.forEach(
                    (uri) => {
                        let filePath = uri.path;

                        let document = window.activeTextEditor?.document;
                        if (document && document.uri.path === filePath) {
                            return;
                        }

                        if (FILE_ITEM_CACHE.has(filePath)) {
                            let fileItem = FILE_ITEM_CACHE.get(filePath)!;
                            fileItem.projectRoots.add(this.absProjectRoot);
                            fileItems.push(fileItem);
                        } else {
                            let fileItem = new ProjectFileItem(this.absProjectRoot, filePath);
                            FILE_ITEM_CACHE.set(filePath, fileItem);
                            fileItems.push(fileItem);
                        }
                    }
                );

                if (PROJECT_FILE_LRU_CACHE.get(this.label)) {
                    fileItems.sort(this.compFileItems.bind(this));
                }

                return fileItems;
            }
        );
    }

    // return negative if item1 should be placed before item2
    compFileItems(item1: ProjectFileItem, item2: ProjectFileItem): number {
        let lruCache = PROJECT_FILE_LRU_CACHE.get(this.label)!;
        // the one with bigger rank is placed before the other
        let rank1 = lruCache.get(item1.absPath);
        let rank2 = lruCache.get(item2.absPath);
        return rank2 - rank1;
    }

    intoWorkspace(): boolean {
        let existedFolder = workspace.getWorkspaceFolder(Uri.file(this.absProjectRoot));
        if (!existedFolder) {
            let status = workspace.updateWorkspaceFolders(
                workspace.workspaceFolders ? workspace.workspaceFolders.length : 0,
                null,
                {
                    uri: Uri.file(this.absProjectRoot),
                    name: this.label
                }
            );
            if (status === false) {
                window.showErrorMessage(`fail to add ${this.absProjectRoot} to workspace`);
                return false;
            }
        }

        return true;
    }

    removeFromWorkspace() {
        let workspaceFolder = workspace.getWorkspaceFolder(Uri.file(this.absProjectRoot));
        if (workspaceFolder !== undefined) {
            workspace.updateWorkspaceFolders(workspaceFolder.index, 1);
        }
    }
}


export class ProjectFileItem implements QuickPickItem {
    description: string;
    label: string;
    absPath: string;
    projectRoots: Set<string> = new Set<string>();  // indicating which projects have this file

    constructor(projectRoot: string, filePath: string) {
        this.label = PathLib.basename(filePath);
        this.description = PathLib.join(PathLib.basename(projectRoot), this.label);
        this.absPath = filePath;
        this.projectRoots.add(projectRoot);
    }
}