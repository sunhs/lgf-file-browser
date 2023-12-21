import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { basename, dirname, isAbsolute, join } from "path";
import { Md5 } from "ts-md5";
import { QuickPick, RelativePattern, Uri, commands, window, workspace } from "vscode";
import { globalConf } from "./conf";
import { FileBrowser } from "./fileBrowser";
import { FilePathItem, ProjectFileItem, ProjectItem, getFileItemFromCache, loadRecentHistoryLog, saveRecentHistorLog, updateRecentHistoryLog } from "./filePathItem";
import { LruMap, States, isDir, isDirType, setContext, transformPath } from "./utils";


enum Messages {
    selectProject = "select project",
    selectWorkspaceProject = "select project from workspace",
    deleteWorkspaceProject = "delete project from workspace",
    projectAdded = "project added"
}


export class ProjectManager extends FileBrowser {
    projectListFile: string = join(homedir(), ".lgf-proj-mgr.json");
    lastProjectListFileHash: string | undefined;
    projects: LruMap<string, string> = new LruMap<string, string>(100);
    recentHistoryLog: string = join(homedir(), ".lgf-proj-mgr-rank.json");
    projectQuickPick: QuickPick<ProjectItem> | undefined;
    projectFileQuickPick: QuickPick<ProjectFileItem> | undefined;
    fileConsideredProject: Set<string> = new Set<string>();

    constructor() {
        super();

        this.setUp();

        if (!existsSync(this.recentHistoryLog)) {
            writeFileSync(this.recentHistoryLog, "{}");
        }
        loadRecentHistoryLog(this.recentHistoryLog);

        this.registerListener();
    }

    /*********************************** CONFIG SECTION ***********************************/
    setUp() {
        globalConf.update();
        this.fileConsideredProject = new Set<string>(globalConf.projectConfFiles);

        if (!existsSync(this.projectListFile)) {
            writeFileSync(this.projectListFile, "{}");
        }

        let content = readFileSync(this.projectListFile, "utf8");
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
        setContext(States.inLgfProjMgr, true);
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
                        setContext(States.inLgfProjMgr, true);
                        this.buildQuickPickFromProjectFiles(new ProjectItem(projectRoot!));
                    }
                }
            );
        } else if (workspace.workspaceFolders && workspace.workspaceFolders.length === 1) {
            setContext(States.inLgfFileBrowser, true);
            this.buildQuickPickFromProjectFiles(new ProjectItem(workspace.workspaceFolders[0].uri.path));
        }
        else {
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
        this.projects.set(basename(dir), dir);
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
        let isDirVar = await isDir(dir);

        if (!(isAbsolute(dir) && isDirVar)) {
            window.showErrorMessage(`${dir} is not an absolute path to a directory`);
            this.dispose();
        }

        this.currentDir = dir;

        let files = await workspace.fs.readDirectory(uri);
        this.currentItems = files.filter(
            ([fileName, fileType]) => isDirType(fileType)
        )
            .sort()
            .map(
                ([fileName, fileType]) =>
                    new FilePathItem(join(dir, fileName), fileType)
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
        setContext(States.inLgfProjMgr, true);
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
        setContext(States.inLgfProjMgr, true);
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
                this.projectFileQuickPick!.title = basename(projectItem.label);
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
        globalConf.projectDotIgnoreFiles.forEach(
            (ignoreFile) => {
                let ignoreFilePath = join(projectRoot, ignoreFile);
                if (existsSync(ignoreFilePath)) {
                    String(readFileSync(ignoreFilePath)).split("\n").forEach(
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
            globalConf.filterGlobPatterns.concat(extendedPatterns)
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
                    this.tryAddProject(folder.uri.path).then((projRoot) => {
                        if (!projRoot) {
                            return;
                        }

                        // 替换成 transformPath 后的 project
                        if (!folder.uri.path.startsWith(projRoot)) {
                            workspace.updateWorkspaceFolders(
                                folder.index,
                                1,
                                {
                                    uri: Uri.file(projRoot),
                                    name: folder.name,
                                }
                            );
                        }
                    });
                }
            }
        );

        window.onDidChangeVisibleTextEditors(
            (editors) => {
                if (editors.length === 0) {
                    return;
                }

                let editor = window.activeTextEditor!;
                if (editor.document.isUntitled) {
                    return;
                }

                let docPath = editor.document.uri.path;
                let transformedDocPath = transformPath(docPath, globalConf);
                if (transformedDocPath === this.projectListFile) {
                    return;
                }

                if (transformedDocPath !== docPath) {
                    commands.executeCommand("workbench.action.closeActiveEditor");
                    commands.executeCommand("vscode.open", Uri.file(transformedDocPath));
                    return;
                }

                this.tryAddProject(transformedDocPath).then(
                    (projectRoot) => {
                        if (projectRoot) {
                            updateRecentHistoryLog(basename(projectRoot!), transformedDocPath);
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
            // No matter whether the projectName already exists, update it.
            // So that the same projectName for different projects won't be occupied by
            // one project permanently.
            this.projects.set(basename(projectRoot), projectRoot);
            this.saveProjects();
            return projectRoot;
        }

        console.log(`failed to detect a project for ${filePath}`);
    }

    async tryResolveProjectRoot(filePath: string): Promise<string | undefined> {
        // 1. try file item cache
        let cachedFileItem = getFileItemFromCache(filePath);
        if (cachedFileItem) {
            return transformPath(cachedFileItem.projectRoots.values().next().value, globalConf);
        }

        // 2. try workspace folder
        let workspaceFolder = workspace.getWorkspaceFolder(Uri.file(filePath));
        if (workspaceFolder) {
            return transformPath(workspaceFolder!.uri.path, globalConf);
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
                return transformPath(projectPath, globalConf);
            }
        }

        // 4. guess project list
        let isDirVar = await isDir(filePath);
        let dir = isDirVar ? filePath : dirname(filePath);

        while (true) {
            if (dir === "/" || dir === homedir()) {
                break;
            }

            let files = await workspace.fs.readDirectory(Uri.file(dir));
            let fileNames = files.map(([fileName, _]) => fileName);
            let intersection = [...fileNames].filter(
                fileName => this.fileConsideredProject.has(fileName)
            );
            if (intersection.length !== 0) {
                return transformPath(dir, globalConf);
            }
            dir = dirname(dir);
        }

        return undefined;
    }

    saveProjects() {
        for (let [projName, projPath] of this.projects.entries()) {
            if (!existsSync(projPath) || !isAbsolute(projPath)) {
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
            writeFileSync(this.projectListFile, content);
        }
    }

    dispose() {
        setContext(States.inLgfProjMgr, false);
        this.projectQuickPick?.dispose();
        this.projectFileQuickPick?.dispose();
        super.dispose();
    }
}