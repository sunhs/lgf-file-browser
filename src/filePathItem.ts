import { readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { basename, dirname, isAbsolute } from "path";
import { CancellationError, FileType, QuickPickItem, RelativePattern, Uri, window, workspace } from "vscode";
import { globalConf } from "./conf";
import { FixSizedMap, WeightedLruCache, transformPath } from "./utils";


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
        if (!isAbsolute(path)) {
            let err = new CancellationError();
            err.message = `path ${path} is not absolute`;
            throw err;
        }
        this.absPath = path;

        this.fileType = fileType;
        let baseName = basename(path);
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


// Map file path to ProjectFileItem, just to quickly find a ProjectFileItem from its absPath.
let FILE_ITEM_CACHE = new FixSizedMap<string, ProjectFileItem>(FILE_CACHE_MAX_SIZE);
// Map project name to LRU cache of project files.
// The WeightedLruCache is not really an LruCache, as it does nothing on visiting.
let PROJECT_FILE_LRU_CACHE = new Map<string, WeightedLruCache<string>>();


export function getFileItemFromCache(filePath: string): ProjectFileItem | undefined {
    return FILE_ITEM_CACHE.get(filePath);
}


export function loadRecentHistoryLog(logFile: string, availableProjects?: Set<string>) {
    let content = readFileSync(logFile, "utf8");
    let log: { [key: string]: string[] } = JSON.parse(content);
    Object.entries(log).forEach(
        ([projectName, filePaths]) => {
            if (availableProjects! && !availableProjects.has(projectName)) {
                return;
            }

            let cache = new WeightedLruCache<string>(LRU_MAX_SIZE);
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
    writeFileSync(logFile, JSON.stringify(jsonObj));
}


export function updateRecentHistoryLog(projectName: string, filePath: string) {
    if (!PROJECT_FILE_LRU_CACHE.has(projectName)) {
        PROJECT_FILE_LRU_CACHE.set(projectName, new WeightedLruCache<string>(LRU_MAX_SIZE));
    }
    PROJECT_FILE_LRU_CACHE.get(projectName)!.put(filePath);
}


export class ProjectItem implements QuickPickItem {
    description: string;
    label: string;
    absProjectRoot: string;

    constructor(projectRoot: string) {
        projectRoot = transformPath(projectRoot, globalConf);
        this.label = basename(projectRoot);
        this.description = projectRoot.replace(homedir(), "~");
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
                        if (document && transformPath(document.uri.path, globalConf) === filePath) {
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
        if (!existedFolder || existedFolder.uri.path !== this.absProjectRoot) {
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
        this.label = basename(filePath);
        this.absPath = filePath;
        this.projectRoots.add(projectRoot);
        let relPath = filePath.replace(dirname(projectRoot), "");
        if (relPath.startsWith("/")) {
            relPath = relPath.substr(1);
        }
        this.description = relPath;
    }
}