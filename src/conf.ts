import { workspace } from "vscode";


enum ConfigEnum {
    filterGlobPatterns = "filterGlobPatterns",
    projectConfFiles = "projectConfFiles",
    projectDotIgnoreFiles = "projectDotIgnoreFiles",
}


function getConfig<T>(item: ConfigEnum): T | undefined {
    return workspace.getConfiguration("lgf-file-browser").get(item);
}


export class Config {
    filterGlobPatterns: string[] = [];
    projectConfFiles: string[] = [];
    projectDotIgnoreFiles: string[] = [];

    update() {
        this.filterGlobPatterns = getConfig(ConfigEnum.filterGlobPatterns)!;
        this.projectConfFiles = getConfig(ConfigEnum.projectConfFiles)!;
        this.projectDotIgnoreFiles = getConfig(ConfigEnum.projectDotIgnoreFiles)!;
    }
}