// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as OS from 'os';
import * as vscode from 'vscode';
import { FileBrowser } from './fileBrowser';
import { ProjectManager } from './projectManager';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	let fileBrowser = new FileBrowser();
	let projectManager = new ProjectManager();
	let active: FileBrowser | ProjectManager | undefined;

	function chooseInstance() {
		if (active! instanceof ProjectManager) {
			return projectManager;
		} else if (active! instanceof FileBrowser) {
			return fileBrowser;
		}
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.show', () => {
			fileBrowser.show();
			active = fileBrowser;
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.goUp', () => {
			chooseInstance()!.goUp();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.toggleHidden', () => {
			chooseInstance()!.toggleHidden();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.toggleFilter', () => {
			chooseInstance()!.toggleFilter();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.goToHome', () => {
			chooseInstance()!.update(OS.homedir());
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.goToRoot', () => {
			chooseInstance()!.update("/");
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.addProject', () => {
			projectManager.showAddProject();
			active = projectManager;
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.openProject', () => {
			projectManager.showOpenProject();
			active = projectManager;
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.findFileFromProject', () => {
			projectManager.showFindFileFromProject();
			active = projectManager;
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.findFileFromWorkspaceProject', () => {
			projectManager.showFindFileFromWSProject();
			active = projectManager;
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.findFileFromCurrentProject', () => {
			projectManager.showFindFileFromCurrentProject();
			active = projectManager;
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.deleteProjectFromWorkspace', () => {
			projectManager.showDeleteProjectFromWorkspace();
			active = projectManager;
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.editProjectList', () => {
			projectManager.editProjectList();
			active = projectManager;
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.confirmAddProject', () => {
			projectManager.confirmAddProjectToList();
			active = projectManager;
		})
	);
}

// this method is called when your extension is deactivated
export function deactivate() { }
