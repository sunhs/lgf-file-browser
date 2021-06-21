// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as OS from 'os';
import * as vscode from 'vscode';
import { FileBrowser } from './fileBrowser';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	let fileBrowser = new FileBrowser();

	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.show', () => {
			fileBrowser.show();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.goUp', () => {
			fileBrowser!.goUp();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.accept', () => {
			fileBrowser!.onDidAccept();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.toggleHidden', () => {
			fileBrowser!.toggleHidden();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.toggleFilter', () => {
			fileBrowser!.toggleFilter();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.goToHome', () => {
			fileBrowser.update(OS.homedir());
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('lgf-file-browser.goToRoot', () => {
			fileBrowser.update("/");
		})
	);
}

// this method is called when your extension is deactivated
export function deactivate() { }
