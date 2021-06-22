# LGF File Browser

This is a file browser which lets you quickly navigate through files, add or delete projects.

There are often times when you don't want to leave your hands off the keyboard, just to reach to the mouse for a few clicks and go back typing. There are often times when you press `cmd+p` to search for a file, only to find multiple files with the same name coming from different projects, struggling to distinguish between them.

That's what `LGF File browser` is here for.

## Installation

Search `lgf-file-browser` in the `Extensions` view.

## Commands and Features

Functionalities are splitted into two parts:

1. the basic file browser for finding arbitrary files
2. the project manager to record your projects, and enables you to quickly switch between them

When you add a folder to the workspace or open a new document, this extension will try to discover the project and save it.

- `lgf-file-browser.show` reveal the file browser (`C-c C-f`)
- `lgf-file-browser.goUp` go to the parent directory (`backspace`)
- `lgf-file-browser.goToHome` go to the home directory (`~`)
- `lgf-file-browser.goToRoot` go to `/` directory (`/`)
- `lgf-file-browser.toogleHidden` hide or show dot files (`C-h`)
- `lgf-file-browser.toggleFilter` hide or show filttered files (`C-f`)
- `lgf-file-browser.addProject` choose a directory and save to the project list (`C-c C-a`)
- `lgf-file-browser.confirmAddProject` this is a quick pick action for `lgf-file-browser.addProject`, since the `enter` is used to go into a directory, we need some key to confirm adding (`C-a`)
- `lgf-file-browser.openProject` open a saved project, bring it to the workspace (`C-c C-o`)
- `lgf-file-browser.findFileFromProject` choose a project from the saved project list and find a file in it (`C-c C-p`)
- `lgf-file-browser.findFileFromWorkspaceProject` choose a project from workspace and find a file in it (`C-c C-w`)
- `lgf-file-browser.findFileFromCurrentProject` find a file in the current project, which is inferred from the file you're editting (`C-c C-c`)
- `lgf-file-browser.deleteProjectFromWorkspace` remove a project from the workspace (`C-c C-d`)
- `lgf-file-browser.editProjectList` edit the project list (`C-c C-e`)

## Configuration

- `lgf-file-browser.filterFilePatterns` A list of regex patterns. This is used to filter the files when you press `C-f` in the file browser. Note that this doesn't apply when you're searching in projects, where instead `Files: Exclude` from the VSCode settings would take effect.

## Limitation and Known Issues

- File paths are based on Unix like systems. Problems are likely to be encountered on Windows.
- `lgf-file-browser.findFileFromProject` would automatically add the project to workspace before finding files, due to the VSCode API limitation (`workspace.findFiles`). However, when there are currently no workspace folders, after adding the project to workspace, there won't be search candidates for project files. A bug to fix.
- Key bindings are a bit Emacs like. Change them at your need. But remember to keep the `when` clause.
