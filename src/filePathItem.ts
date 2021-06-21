import { QuickPickItem, FileType, CancellationError } from "vscode";
import * as pathLib from "path";

export class FilePathItem implements QuickPickItem {
    absPath: string;
    show: boolean = true;
    description?: string;
    detail?: string;
    fileType: FileType;
    label: string;

    constructor(path: string, fileType: FileType) {
        if (!pathLib.isAbsolute(path)) {
            let err = new CancellationError();
            err.message = `path ${path} is not absolute`;
            throw err;
        }
        this.absPath = path;

        this.fileType = fileType;
        let baseName = pathLib.basename(path);
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