import { commands, FileType, QuickPick, Uri, window, workspace } from "vscode";
import * as pathLib from "path";
import * as OS from "os";
import { FilePathItem } from "./filePathItem";
import { FILTER_PATTERNS, loadConf } from "./conf";


function setState(state: boolean) {
    commands.executeCommand("setContext", "inLgfFileBrowser", state);
}


function setQuickPickEmpty(state: boolean) {
    commands.executeCommand("setContext", "lgfFileBrowserEmpty", state);
}


function isDir(fileType: FileType): boolean {
    return (fileType & FileType.Directory) === FileType.Directory;
}


export class FileBrowser {
    quickPick: QuickPick<FilePathItem> | undefined;
    currentDir: string | undefined;
    currentItems: FilePathItem[] = [];
    hideDotFiles: boolean = true;
    filterFiles: boolean = true;
    filterPatterns: RegExp[] = [];

    // the start point
    show() {
        loadConf();

        this.hideDotFiles = true;
        this.filterPatterns = FILTER_PATTERNS;
        this.filterFiles = FILTER_PATTERNS.length !== 0;

        this.quickPick = window.createQuickPick();
        this.quickPick.onDidAccept(this.onDidAccept.bind(this));
        this.quickPick.onDidChangeValue(this.onDidChangeValue.bind(this));

        let document = window.activeTextEditor?.document;
        let currentDir = OS.homedir();
        if (document && !document.isUntitled) {
            currentDir = pathLib.dirname(document.uri.path);
        }
        this.currentDir = currentDir;

        setState(true);
        setQuickPickEmpty(true);
        this.update(this.currentDir);
    }

    dispose() {
        setState(false);
        setQuickPickEmpty(true);
        this.quickPick!.dispose();
    }

    goUp() {
        let upDir = pathLib.dirname(this.quickPick!.title!);
        this.update(upDir);
    }

    onDidAccept() {
        if (this.quickPick!.selectedItems.length === 0) {
            return;
        }

        let acceptedPath = this.quickPick!.selectedItems[0].absPath!;
        workspace.fs.stat(Uri.file(acceptedPath)).then(
            (stat) => {
                if (isDir(stat.type)) {
                    this.update(acceptedPath);
                    this.quickPick!.value = "";
                } else {
                    commands.executeCommand("vscode.open", Uri.file(acceptedPath));
                    this.dispose();
                }
            }
        );
    }

    onDidChangeValue() {
        setQuickPickEmpty(this.quickPick?.value === "");
    }

    async update(dir: string) {
        let uri = Uri.file(dir);
        let stat = await workspace.fs.stat(uri);

        if (!(pathLib.isAbsolute(dir) && isDir(stat.type))) {
            window.showErrorMessage(`${dir} is not an absolute path to a directory`);
            this.dispose();
        }

        let files = await workspace.fs.readDirectory(uri);
        this.currentItems = files.sort(
            ([fileName1, fileType1], [fileName2, fileType2]) => {
                if (
                    (isDir(fileType1) && isDir(fileType2))
                    || (!isDir(fileType1) && !isDir(fileType2))
                ) {
                    if (
                        (fileName1.startsWith(".") && fileName2.startsWith("."))
                        || (!fileName1.startsWith(".") && !fileName2.startsWith("."))
                    ) {
                        return fileName1 <= fileName2 ? -1 : 1;
                    } else {
                        return fileName1.startsWith(".") ? -1 : 1;
                    }
                } else {
                    return isDir(fileType1) ? -1 : 1;
                }
            }
        ).map(
            ([fileName, fileType]) =>
                new FilePathItem(pathLib.join(dir, fileName), fileType)
        );

        this.setItemVisibility();

        this.currentDir = dir;
        this.quickPick!.items = this.currentItems.filter(
            filePathItem => filePathItem.show
        );
        this.quickPick!.title = dir;
        this.quickPick!.show();
    }

    setItemVisibility() {
        this.currentItems.map(
            (filePathItem) => {
                let baseName = pathLib.basename(filePathItem.absPath);
                if (this.hideDotFiles && baseName.startsWith(".")) {
                    filePathItem.show = false;
                    return;
                }
                if (this.filterFiles) {
                    for (let pattern of this.filterPatterns) {
                        if (pattern.test(baseName)) {
                            filePathItem.show = false;
                            return;
                        }
                    }
                }
                filePathItem.show = true;
            }
        );
    }

    toggleHidden() {
        this.hideDotFiles = !this.hideDotFiles;
        this.setItemVisibility();
        this.quickPick!.items = this.currentItems.filter(
            filePathItem => filePathItem.show
        );
        this.quickPick!.show();
    }

    toggleFilter() {
        this.filterFiles = !this.filterFiles;
        this.setItemVisibility();
        this.quickPick!.items = this.currentItems.filter(
            filePathItem => filePathItem.show
        );
        this.quickPick!.show();
    }
}