import * as OS from "os";
import * as PathLib from "path";
import * as fs from "fs";
import { Md5 } from "ts-md5";
import * as utils from "./utils";
import { commands, QuickPick, RelativePattern, Uri, window, workspace } from "vscode";
import { FileBrowser } from "./fileBrowser";
import { FilePathItem, ProjectFileItem, ProjectItem, getFileItemFromCache, loadRecentHistoryLog, saveRecentHistorLog, updateRecentHistoryLog } from "./filePathItem";
import { LruMap } from "./utils";


enum Messages {
    selectProject = "select project",
    selectWorkspaceProject = "select project from workspace",
    deleteWorkspaceProject = "delete project from workspace",
    projectAdded = "project added"
}


export class ProjectManager extends FileBrowser {
    projectListFile: string = PathLib.join(OS.homedir(), ".lgf-proj-mgr.json");
    lastProjectListFileHash: string | undefined;
    projects: LruMap<string, string> = new LruMap<string, string>(100);
    recentHistoryLog: string = PathLib.join(OS.homedir(), ".lgf-proj-mgr-rank.json");
    projectQuickPick: QuickPick<ProjectItem> | undefined;
    projectFileQuickPick: QuickPick<ProjectFileItem> | undefined;
    fileConsideredProject: Set<string> = new Set<string>();

    constructor() {
        super();

        this.setUp();

        if (!fs.existsSync(this.recentHistoryLog)) {
            fs.writeFileSync(this.recentHistoryLog, "{}");
        }
        loadRecentHistoryLog(this.recentHistoryLog);

        this.registerListener();
    }

    /*********************************** CONFIG SECTION ***********************************/
    setUp() {
        this.config.update();
        this.fileConsideredProject = new Set<string>(this.config.projectConfFiles);

        if (!fs.existsSync(this.projectListFile)) {
            fs.writeFileSync(this.projectListFile, "{}");
        }

        let content = fs.readFileSync(this.projectListFile, "utf8");
        let hash = Md5.hashStr(content);
        if (this.lastProjectListFileHash !== hash) {
            let parsed: { [key: string]: string } = JSON.parse(content);
            this.projects.clear();
            // In the list file, entries are listed from newer to older.
            Object.entries(parsed).reverse().forEach(
                ([k, v]) => {
                    this.projects.set(k, v);
                }
            );
            this.lastProjectListFileHash = hash;
        }
    }

    /*********************************** QUICKPICK COMMAND SECTION ***********************************/
    // add project to project list
    showAddProject() {
        this.setUp();
        // this will call this.update() which allows users to navigate through directories
        // also this will invoke context setting in `FileBrowser`
        utils.setContext(utils.States.inLgfProjMgr, true);
        super.show();
    }

    // add project to current workspace
    showOpenProject() {
        this.setUp();
        this.buildQuickPickFromProjectList();
        this.projectQuickPick!.onDidAccept(this.onDidAcceptOpenProject.bind(this));
    }

    showFindFileFromProject() {
        this.setUp();
        this.buildQuickPickFromProjectList();
        this.projectQuickPick!.onDidAccept(this.onDidAcceptFindFileFromProject.bind(this));
    }

    // find file from one of workspace projects
    showFindFileFromWSProject() {
        this.setUp();
        this.buidlQuickPickFromWorkspaceProjects();
        this.projectQuickPick!.title = Messages.selectWorkspaceProject;
        this.projectQuickPick!.onDidAccept(this.onDidAcceptFindFileFromWSProject.bind(this));
        this.projectQuickPick!.show();
    }

    showFindFileFromCurrentProject() {
        this.setUp();
        let document = window.activeTextEditor?.document;
        if (document && !document.isUntitled) {
            this.tryResolveProjectRoot(document.uri.path).then(
                (projectRoot) => {
                    if (projectRoot === undefined) {
                        window.showErrorMessage("cannot infer current project, choose another project");
                        this.buildQuickPickFromProjectList();
                        this.projectQuickPick!.onDidAccept(this.onDidAcceptFindFileFromProject.bind(this));
                    } else {
                        utils.setContext(utils.States.inLgfProjMgr, true);
                        this.buildQuickPickFromProjectFiles(new ProjectItem(projectRoot!));
                    }
                }
            );
        } else {
            window.showErrorMessage("cannot infer current project, choose another project");
            this.buildQuickPickFromProjectList();
            this.projectQuickPick!.onDidAccept(this.onDidAcceptFindFileFromProject.bind(this));
        }
    }

    showDeleteProjectFromWorkspace() {
        this.setUp();

        if (workspace.workspaceFolders === undefined || workspace.workspaceFolders.length === 0) {
            return;
        }

        this.buidlQuickPickFromWorkspaceProjects();
        this.projectQuickPick!.title = Messages.deleteWorkspaceProject;
        this.projectQuickPick!.onDidAccept(this.onDidAcceptDelProjectFromWorkspace.bind(this));
        this.projectQuickPick!.show();
    }

    /*********************************** NORMAL COMMAND SECTION ***********************************/
    confirmAddProjectToList() {
        if (this.quickPick!.activeItems.length === 0) {
            return;
        }
        let dir = this.quickPick!.activeItems[0].absPath!;
        new ProjectItem(dir).intoWorkspace();
        this.projects.set(PathLib.basename(dir), dir);
        this.saveProjects();
        window.showInformationMessage(Messages.projectAdded);
        this.dispose();
    }

    editProjectList() {
        commands.executeCommand("vscode.open", Uri.file(this.projectListFile));
    }

    /**************************************** EVENT SECTION ****************************************/
    onDidAcceptOpenProject() {
        let selected = this.projectQuickPick!.selectedItems[0];
        selected.intoWorkspace();
        this.projects.set(selected.label, selected.absProjectRoot);
        this.saveProjects();
        this.dispose();
    }

    // find file from one of all known projects
    // Currently the find file API from vscode only supports workspace folders,
    // so this command automatically adds the project to workspace before finding files.
    onDidAcceptFindFileFromProject() {
        let selected = this.projectQuickPick!.selectedItems[0];
        this.projects.set(selected.label, selected.absProjectRoot);
        this.saveProjects();
        this.buildQuickPickFromProjectFiles(selected);
    }

    onDidAcceptFindFileFromWSProject() {
        let projectItem = this.projectQuickPick!.selectedItems[0];
        this.projects.set(projectItem.label, projectItem.absProjectRoot);
        this.saveProjects();
        this.buildQuickPickFromProjectFiles(projectItem);
    }

    onDidAcceptDelProjectFromWorkspace() {
        let projectItem = this.projectQuickPick!.selectedItems[0];
        projectItem.removeFromWorkspace();
        this.dispose();
    }

    // ******************************** NORMAL CLASS METHOD SECTION ********************************
    async update(dir: string) {
        let uri = Uri.file(dir);
        let isDir = await utils.isDir(dir);

        if (!(PathLib.isAbsolute(dir) && isDir)) {
            window.showErrorMessage(`${dir} is not an absolute path to a directory`);
            this.dispose();
        }

        this.currentDir = dir;

        let files = await workspace.fs.readDirectory(uri);
        this.currentItems = files.filter(
            ([fileName, fileType]) => utils.isDirType(fileType)
        )
            .sort()
            .map(
                ([fileName, fileType]) =>
                    new FilePathItem(PathLib.join(dir, fileName), fileType)
            );

        this.setItemVisibility();
        this.quickPick!.items = this.currentItems.filter(
            filePathItem => filePathItem.show
        );
        this.quickPick!.title = dir;
        this.quickPick!.show();
    }

    buildQuickPickFromProjectList() {
        this.projectQuickPick = window.createQuickPick();
        let projectItems: ProjectItem[] = [];
        this.projects.values().forEach(
            (v, _) => {
                projectItems.push(new ProjectItem(v));
            }
        );
        this.projectQuickPick.items = projectItems;
        this.projectQuickPick.title = Messages.selectProject;
        this.projectQuickPick.matchOnDescription = true;
        this.projectQuickPick.onDidHide(this.dispose.bind(this));
        utils.setContext(utils.States.inLgfProjMgr, true);
        this.projectQuickPick!.show();
    }

    buidlQuickPickFromWorkspaceProjects() {
        this.projectQuickPick = window.createQuickPick();
        this.projectQuickPick.items = workspace.workspaceFolders ?
            workspace.workspaceFolders.map(
                (folder, index, arr) => new ProjectItem(folder.uri.path)
            ) : [];
        this.projectQuickPick.matchOnDescription = true;
        this.projectQuickPick.onDidHide(this.dispose.bind(this));
        utils.setContext(utils.States.inLgfProjMgr, true);
    }

    buildQuickPickFromProjectFiles(projectItem: ProjectItem) {
        this.projectQuickPick?.dispose();

        projectItem.getFileItems(
            this.buildExcludeGlobPattern(projectItem.absProjectRoot)
        ).then(
            (projectFileItems) => {
                if (!projectFileItems) {
                    return;
                }

                this.projectFileQuickPick = window.createQuickPick();
                this.projectFileQuickPick!.items = projectFileItems;
                this.projectFileQuickPick!.title = PathLib.basename(projectItem.label);
                this.projectFileQuickPick!.matchOnDescription = true;
                this.projectFileQuickPick.onDidHide(this.dispose.bind(this));
                this.projectFileQuickPick!.onDidAccept(
                    (e) => {
                        let filePath = this.projectFileQuickPick!.selectedItems[0].absPath;
                        commands.executeCommand("vscode.open", Uri.file(filePath));
                    }
                );
                this.projectFileQuickPick!.show();
            }
        );
    }

    buildExcludeGlobPattern(projectRoot: string): RelativePattern {
        let extendedPatterns: string[] = [];
        this.config.projectDotIgnoreFiles.forEach(
            (ignoreFile) => {
                let ignoreFilePath = PathLib.join(projectRoot, ignoreFile);
                if (fs.existsSync(ignoreFilePath)) {
                    String(fs.readFileSync(ignoreFilePath)).split("\n").forEach(
                        (line) => {
                            line = line.trim();
                            if (!line.startsWith("#")) {
                                extendedPatterns.push(line);
                            }
                        }
                    );
                }
            }
        );

        let patternSet: Set<string> = new Set<string>(
            this.config.filterGlobPatterns.concat(extendedPatterns)
        );
        return new RelativePattern(
            projectRoot, `{${Array.from(patternSet).join(",")}}`
        );
    }

    registerListener() {
        workspace.onDidChangeWorkspaceFolders(
            (e) => {
                if (e.added.length === 0) {
                    return;
                }
                for (let folder of e.added) {
                    this.tryAddProject(folder.uri.path);
                }
            }
        );

        window.onDidChangeVisibleTextEditors(
            (editors) => {
                if (editors.length === 0) {
                    return;
                }

                let editor = window.activeTextEditor!;
                if (editor.document.isUntitled || editor.document.uri.path === this.projectListFile) {
                    return;
                } this.tryAddProject(editor.document.uri.path).then(
                    (projectRoot) => {
                        if (projectRoot) {
                            updateRecentHistoryLog(PathLib.basename(projectRoot!), editor.document.uri.path);
                            saveRecentHistorLog(this.recentHistoryLog);
                        }
                    }
                );
            }
        );

        // let watcher = workspace.createFileSystemWatcher(this.projectListFile, true, false, true);
        // watcher.onDidChange(
        //     (uri) => {
        //         let availableProjects: Set<string> = new Set<string>();
        //         this.projects.forEach(
        //             (_, k) => {
        //                 availableProjects.add(k);
        //             }
        //         );
        //         loadRecentHistoryLog(this.recentHistoryLog, availableProjects);
        //         saveRecentHistorLog(this.recentHistoryLog);
        //     }
        // );
    }

    async tryAddProject(filePath: string): Promise<string | undefined> {
        let projectRoot = await this.tryResolveProjectRoot(filePath);

        if (projectRoot) {
            let projectName = PathLib.basename(projectRoot);
            if (!this.projects.has(projectName)) {
                this.projects.set(PathLib.basename(projectRoot), projectRoot);
                this.saveProjects();
            }
            return projectRoot;
        }

        console.log(`failed to detect a project for ${filePath}`);
    }

    async tryResolveProjectRoot(filePath: string): Promise<string | undefined> {
        // 1. try file item cache
        let cachedFileItem = getFileItemFromCache(filePath);
        if (cachedFileItem) {
            return cachedFileItem.projectRoots.values().next().value;
        }

        // 2. try workspace folder
        let workspaceFolder = workspace.getWorkspaceFolder(Uri.file(filePath));
        if (workspaceFolder) {
            return workspaceFolder!.uri.path;
        }

        // 3. try saved project list
        for (let projectPath of this.projects.values()) {
            // Avoid the condition where
            // filePath: /path/to/dir_xxx/file
            // projectPath: /path/to/dir
            if (!projectPath.endsWith("/")) {
                projectPath = projectPath + "/";
            }
            if (filePath.startsWith(projectPath)) {
                return projectPath;
            }
        }

        // 4. guess project list
        let isDir = await utils.isDir(filePath);
        let dir = isDir ? filePath : PathLib.dirname(filePath);

        while (true) {
            if (dir === "/" || dir === OS.homedir()) {
                break;
            }

            let files = await workspace.fs.readDirectory(Uri.file(dir));
            let fileNames = files.map(([fileName, _]) => fileName);
            let intersection = [...fileNames].filter(
                fileName => this.fileConsideredProject.has(fileName)
            );
            if (intersection.length !== 0) {
                return dir;
            }
            dir = PathLib.dirname(dir);
        }

        return undefined;
    }

    saveProjects() {
        for (let [projName, projPath] of this.projects.entries()) {
            if (!fs.existsSync(projPath) || !PathLib.isAbsolute(projPath)) {
                console.log(`remove project ${projPath}`);
                this.projects.delete(projName);
            }
        }
        let jsonObj: { [key: string]: string } = {};
        this.projects.entries().forEach(
            ([k, v], _) => {
                jsonObj[k] = v;
            }
        );
        let content = JSON.stringify(jsonObj, null, 4);
        let hash = Md5.hashStr(content);
        if (hash !== this.lastProjectListFileHash) {
            fs.writeFileSync(this.projectListFile, content);
        }
    }

    dispose() {
        utils.setContext(utils.States.inLgfProjMgr, false);
        this.projectQuickPick?.dispose();
        this.projectFileQuickPick?.dispose();
        super.dispose();
    }
}