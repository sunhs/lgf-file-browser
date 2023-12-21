import { isMatch } from "micromatch";
import { homedir } from "os";
import { basename, dirname, isAbsolute, join } from "path";
import { QuickPick, Uri, commands, window, workspace } from "vscode";
import { globalConf } from "./conf";
import { FilePathItem } from "./filePathItem";
import { States, isDir, isDirType, setContext } from "./utils";


export class FileBrowser {
    quickPick: QuickPick<FilePathItem> | undefined;
    currentDir: string | undefined;
    currentItems: FilePathItem[] = [];
    hideDotFiles: boolean = true;
    filterFiles: boolean = true;

    // the start point
    show() {
        globalConf.update();
        this.hideDotFiles = true;
        this.filterFiles = globalConf.filterGlobPatterns.length !== 0;

        this.quickPick = window.createQuickPick();

        let document = window.activeTextEditor?.document;
        let currentDir = homedir();
        if (document && !document.isUntitled) {
            currentDir = dirname(document.uri.path);
        }
        this.currentDir = currentDir;

        setContext(States.inLgfFileBrowser, true);
        setContext(States.lgfFileBrowserEmpty, true);
        this.update(this.currentDir);
        this.quickPick!.onDidAccept(this.onDidAccept.bind(this));
        this.quickPick!.onDidChangeValue(this.onDidChangeValue.bind(this));
        this.quickPick!.onDidHide(this.dispose.bind(this));
    }

    dispose() {
        setContext(States.inLgfFileBrowser, false);
        setContext(States.lgfFileBrowserEmpty, true);
        this.currentItems = [];
        this.quickPick?.dispose();
    }

    goUp() {
        let upDir = dirname(this.quickPick!.title!);
        this.update(upDir);
    }

    async onDidAccept() {
        if (this.quickPick!.selectedItems.length === 0) {
            return;
        }

        let acceptedPath = this.quickPick!.selectedItems[0].absPath!;
        let isDirVar = await isDir(acceptedPath);
        workspace.fs.stat(Uri.file(acceptedPath)).then(
            (stat) => {
                if (isDirVar) {
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
        setContext(States.lgfFileBrowserEmpty, this.quickPick?.value === "");
    }

    async update(dir: string) {
        let uri = Uri.file(dir);
        let isDirVar = await isDir(dir);

        if (!(isAbsolute(dir) && isDirVar)) {
            window.showErrorMessage(`${dir} is not an absolute path to a directory`);
            this.dispose();
        }

        let files = await workspace.fs.readDirectory(uri);
        this.currentItems = files.sort(
            ([fileName1, fileType1], [fileName2, fileType2]) => {
                if (
                    (isDirType(fileType1) && isDirType(fileType2))
                    || (!isDirType(fileType1) && !isDirType(fileType2))
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
                    return isDirType(fileType1) ? -1 : 1;
                }
            }
        ).map(
            ([fileName, fileType]) =>
                new FilePathItem(join(dir, fileName), fileType)
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
                let baseName = basename(filePathItem.absPath);
                if (this.hideDotFiles && baseName.startsWith(".")) {
                    filePathItem.show = false;
                    return;
                }
                if (this.filterFiles) {
                    for (let pattern of globalConf.filterGlobPatterns) {
                        if (isMatch(baseName, pattern)) {
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