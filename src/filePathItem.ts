import { QuickPickItem, FileType, CancellationError } from "vscode";
import * as PathLib from "path";

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


export class ProjectItem implements QuickPickItem {
    description: string;
    label: string;

    constructor(projectName: string, projectRoot: string) {
        this.label = projectName;
        this.description = projectRoot;
    }
}


export class ProjectFileItem implements QuickPickItem {
    description: string;
    label: string;

    constructor(fileName: string, filePath: string) {
        this.label = fileName;
        this.description = filePath;
    }
}