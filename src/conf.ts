import { workspace } from "vscode";


enum ConfigEnum {
    filterGlobPatterns = "filterGlobPatterns",
    projectConfFiles = "projectConfFiles"
}


function getConfig<T>(item: ConfigEnum): T | undefined {
    return workspace.getConfiguration("lgf-file-browser").get(item);
}


export class Config {
    filterGlobPatterns: string[] = [];
    projectConfFiles: string[] = [];

    update() {
        this.filterGlobPatterns = getConfig(ConfigEnum.filterGlobPatterns)!;
        this.projectConfFiles = getConfig(ConfigEnum.projectConfFiles)!;
    }
}