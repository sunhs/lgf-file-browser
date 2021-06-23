import { commands, QuickPick, Uri, window, workspace } from "vscode";
import * as PathLib from "path";
import * as OS from "os";
import { FilePathItem } from "./filePathItem";
import { Config } from "./conf";
import * as utils from "./utils";


export class FileBrowser {
    quickPick: QuickPick<FilePathItem> | undefined;
    currentDir: string | undefined;
    currentItems: FilePathItem[] = [];
    hideDotFiles: boolean = true;
    filterFiles: boolean = true;
    config: Config = new Config();

    // the start point
    show() {
        this.config.update();
        this.hideDotFiles = true;
        this.filterFiles = this.config.filterPatterns.length !== 0;

        this.quickPick = window.createQuickPick();

        let document = window.activeTextEditor?.document;
        let currentDir = OS.homedir();
        if (document && !document.isUntitled) {
            currentDir = PathLib.dirname(document.uri.path);
        }
        this.currentDir = currentDir;

        utils.setContext(utils.States.inLgfFileBrowser, true);
        utils.setContext(utils.States.lgfFileBrowserEmpty, true);
        this.update(this.currentDir);
        this.quickPick!.onDidAccept(this.onDidAccept.bind(this));
        this.quickPick!.onDidChangeValue(this.onDidChangeValue.bind(this));
    }

    dispose() {
        utils.setContext(utils.States.inLgfFileBrowser, false);
        utils.setContext(utils.States.lgfFileBrowserEmpty, true);
        this.currentItems = [];
        this.quickPick?.dispose();
    }

    goUp() {
        let upDir = PathLib.dirname(this.quickPick!.title!);
        this.update(upDir);
    }

    async onDidAccept() {
        if (this.quickPick!.selectedItems.length === 0) {
            return;
        }

        let acceptedPath = this.quickPick!.selectedItems[0].absPath!;
        let isDir = await utils.isDir(acceptedPath);
        workspace.fs.stat(Uri.file(acceptedPath)).then(
            (stat) => {
                if (isDir) {
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
        utils.setContext(utils.States.lgfFileBrowserEmpty, this.quickPick?.value === "");
    }

    async update(dir: string) {
        let uri = Uri.file(dir);
        let isDir = await utils.isDir(dir);

        if (!(PathLib.isAbsolute(dir) && isDir)) {
            window.showErrorMessage(`${dir} is not an absolute path to a directory`);
            this.dispose();
        }

        let files = await workspace.fs.readDirectory(uri);
        this.currentItems = files.sort(
            ([fileName1, fileType1], [fileName2, fileType2]) => {
                if (
                    (utils.isDirType(fileType1) && utils.isDirType(fileType2))
                    || (!utils.isDirType(fileType1) && !utils.isDirType(fileType2))
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
                    return utils.isDirType(fileType1) ? -1 : 1;
                }
            }
        ).map(
            ([fileName, fileType]) =>
                new FilePathItem(PathLib.join(dir, fileName), fileType)
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
                let baseName = PathLib.basename(filePathItem.absPath);
                if (this.hideDotFiles && baseName.startsWith(".")) {
                    filePathItem.show = false;
                    return;
                }
                if (this.filterFiles) {
                    for (let pattern of this.config.filterPatterns) {
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