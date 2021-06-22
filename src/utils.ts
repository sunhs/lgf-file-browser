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