import * as OS from "os";
import * as PathLib from "path";
import * as fs from "fs";
import * as utils from "./utils";
import { commands, QuickPick, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { TSMap } from "typescript-map";
import { FileBrowser } from "./fileBrowser";
import { FilePathItem, ProjectFileItem, ProjectItem } from "./filePathItem";


const fileConsideredProject: Set<string> = new Set<string>(
    [".git", ".svn", ".projectile", ".vscode", "CMakeLists.txt", "Makefile", "setup.py"]
);


export class ProjectManager extends FileBrowser {
    projectListFile: string = PathLib.join(OS.homedir(), ".lgf-proj-mgr.json");
    projects: TSMap<string, string> = new TSMap<string, string>();
    projectQuickPick: QuickPick<ProjectItem> | undefined;

    constructor() {
        super();
        this.readProjectList();
        this.registerListener();
    }

    /*********************************** CONFIG SECTION ***********************************/
    readProjectList() {
        if (!fs.existsSync(this.projectListFile)) {
            fs.writeFileSync(this.projectListFile, "{}");
        }
        let content = fs.readFileSync(this.projectListFile, "utf8");
        this.projects.fromJSON(JSON.parse(content));
    }

    /*********************************** QUICKPICK COMMAND SECTION ***********************************/
    // add project to project list
    showAddProject() {
        this.readProjectList();
        // this will call this.update() which allows users to navigate through directories
        // also this will invoke context setting in `FileBrowser`
        utils.setContext(utils.States.inLgfProjMgr, true);
        super.show();
    }

    // add project to current workspace
    showOpenProject() {
        this.readProjectList();
        this.buildQuickPickFromProjectList();
        this.projectQuickPick!.onDidAccept(this.onDidAcceptOpenProject.bind(this));
        utils.setContext(utils.States.inLgfProjMgr, true);
        this.projectQuickPick!.show();
    }

    showFindFileFromProject() {
        this.readProjectList();
        this.buildQuickPickFromProjectList();
        this.projectQuickPick!.onDidAccept(this.onDidAcceptFindFileFromProject.bind(this));
        utils.setContext(utils.States.inLgfProjMgr, true);
        this.projectQuickPick!.show();
    }

    // find file from one of workspace projects
    showFindFileFromWSProject() {
        this.readProjectList();

        this.projectQuickPick = window.createQuickPick();
        this.projectQuickPick.items = workspace.workspaceFolders ?
            workspace.workspaceFolders.map(
                (folder, index, arr) => new ProjectItem(folder.name, folder.uri.path)
            ) : [];
        this.projectQuickPick.matchOnDescription = true;
        this.projectQuickPick.onDidAccept(this.onDidAcceptFindFileFromWSProject.bind(this));

        utils.setContext(utils.States.inLgfProjMgr, true);
        this.projectQuickPick.show();
    }

    /*
     * find file from current active project
     * Current active project is inferred from the file currently being editted.
     */
    showFindFileFromCurrentProject() {
        this.readProjectList();

        let activeWSFolder: WorkspaceFolder | undefined;
        let document = window.activeTextEditor?.document;
        if (document && !document.isUntitled) {
            activeWSFolder = workspace.getWorkspaceFolder(document.uri);
        }
        if (activeWSFolder === undefined) {
            window.showErrorMessage("cannot infer current project");
        }

        this.projectQuickPick = window.createQuickPick();
        utils.setContext(utils.States.inLgfProjMgr, true);
        this.findFileFromWSProject(activeWSFolder!.uri.path);
    }

    showDeleteProjectFromWorkspace() {
        this.readProjectList();

        if (workspace.workspaceFolders === undefined || workspace.workspaceFolders.length === 0) {
            return;
        }

        this.projectQuickPick = window.createQuickPick();
        this.projectQuickPick.items = workspace.workspaceFolders.map(
            (folder, index, arr) => new ProjectItem(folder.name, folder.uri.path)
        );
        this.projectQuickPick.matchOnDescription = true;
        this.projectQuickPick.onDidAccept(this.onDidAcceptDelProjectFromWorkspace.bind(this));

        utils.setContext(utils.States.inLgfProjMgr, true);
        this.projectQuickPick.show();
    }

    /*********************************** NORMAL COMMAND SECTION ***********************************/
    confirmAddProjectToList() {
        if (this.quickPick!.activeItems.length === 0) {
            return;
        }
        let dir = this.quickPick!.activeItems[0].absPath!;
        this.projects.set(PathLib.basename(dir), dir);
        this.saveProjects();
        this.dispose();
    }

    editProjectList() {
        commands.executeCommand("vscode.open", Uri.file(this.projectListFile));
    }

    /**************************************** EVENT SECTION ****************************************/
    onDidAcceptOpenProject() {
        let selected = this.projectQuickPick!.selectedItems[0];
        workspace.updateWorkspaceFolders(
            workspace.workspaceFolders ? workspace.workspaceFolders.length : 0,
            null,
            {
                uri: Uri.file(selected.description),
                name: selected.label
            }
        );
        this.dispose();
    }

    // find file from one of all known projects
    // Currently the find file API from vscode only supports workspace folders,
    // so this command automatically adds the project to workspace before finding files.
    onDidAcceptFindFileFromProject() {
        let selected = this.projectQuickPick!.selectedItems[0];

        let existedFolder = workspace.getWorkspaceFolder(Uri.file(selected.description));
        if (!existedFolder) {
            let status = workspace.updateWorkspaceFolders(
                workspace.workspaceFolders ? workspace.workspaceFolders.length : 0,
                null,
                {
                    uri: Uri.file(selected.description),
                    name: selected.label
                }
            );
            if (status === false) {
                window.showErrorMessage(`fail to add ${selected.description} to workspace`);
                this.dispose();
                return;
            }
        }

        this.findFileFromWSProject(selected.description);
    }

    onDidAcceptFindFileFromWSProject() {
        let projectRoot = this.projectQuickPick!.selectedItems[0].description;
        this.findFileFromWSProject(projectRoot);
    }

    onDidAcceptDelProjectFromWorkspace() {
        let projectRoot = this.projectQuickPick!.selectedItems[0].description;
        let workspaceFolder = workspace.getWorkspaceFolder(Uri.file(projectRoot));
        if (workspaceFolder !== undefined) {
            workspace.updateWorkspaceFolders(workspaceFolder.index, 1);
        }
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
        this.projectQuickPick.items = this.projects.map(
            (v, k) => new ProjectItem(k!, v)
        );
        this.projectQuickPick.matchOnDescription = true;
    }

    findFileFromWSProject(projectRoot: string) {
        let globPattern = new RelativePattern(projectRoot, "**");
        workspace.findFiles(globPattern).then(
            (uris) => {
                let items = uris.map(
                    (uri) => new ProjectFileItem(PathLib.basename(uri.path), uri.path)
                );
                this.projectQuickPick!.items = items;
                this.projectQuickPick!.matchOnDescription = true;
                this.projectQuickPick!.onDidAccept(
                    (e) => {
                        let filePath = this.projectQuickPick!.selectedItems[0].description;
                        commands.executeCommand("vscode.open", Uri.file(filePath));
                        this.dispose();
                    }
                );
                this.projectQuickPick!.show();
            }
        );
    }

    registerListener() {
        workspace.onDidChangeWorkspaceFolders(
            (e) => {
                if (e.added.length === 0) {
                    return;
                }
                for (let folder of e.added) {
                    if (this.projects.has(folder.name)) {
                        continue;
                    }
                    this.tryAddProject(folder.uri.path);
                }
            }
        );

        window.onDidChangeVisibleTextEditors(
            (editors) => {
                for (let editor of editors) {
                    if (editor.document.isUntitled || editor.document.uri.path === this.projectListFile) {
                        continue;
                    }

                    let inKnownProject = false;
                    for (let projectPath of this.projects.values()) {
                        if (editor.document.uri.path.startsWith(projectPath)) {
                            inKnownProject = true;
                            break;
                        }
                    }
                    if (inKnownProject) {
                        continue;
                    }

                    let workspaceFolder = workspace.getWorkspaceFolder(editor.document.uri);
                    if (workspaceFolder === undefined || this.projects.has(workspaceFolder.name)) {
                        continue;
                    }

                    this.tryAddProject(editor.document.uri.path);
                }
            }
        );
    }

    /*
     * Try to add a project containing the `filePath`.
     * The directory containing `fileConsideredProject` will be
     * considered the project root dir.
     */
    async tryAddProject(filePath: string) {
        let isDir = await utils.isDir(filePath);
        let dir = isDir ? filePath : PathLib.dirname(filePath);

        while (true) {
            if (dir === "/" || dir === OS.homedir()) {
                break;
            }

            let files = await workspace.fs.readDirectory(Uri.file(dir));
            let fileNames = files.map(([fileName, _]) => fileName);
            let intersection = [...fileNames].filter(
                fileName => fileConsideredProject.has(fileName)
            );
            if (intersection.length !== 0) {
                this.projects.set(PathLib.basename(dir), dir);
                this.saveProjects();
                return;
            }
            dir = PathLib.dirname(dir);
        }

        window.showWarningMessage(`failed to detect a project for ${filePath}`);
    }

    saveProjects() {
        for (let projName of this.projects.keys()) {
            let projPath = this.projects.get(projName)!;
            if (!fs.existsSync(projPath) || !PathLib.isAbsolute(projPath)) {
                this.projects.delete(projName);
            }
        }
        let content = JSON.stringify(this.projects.toJSON(), null, 4);
        fs.writeFileSync(this.projectListFile, content);
    }

    dispose() {
        utils.setContext(utils.States.inLgfProjMgr, false);
        this.projectQuickPick?.dispose();
        super.dispose();
    }
}