import { workspace } from "vscode";


enum ConfigEnum {
    filterGlobPatterns = "filterGlobPatterns",
    projectConfFiles = "projectConfFiles",
    projectDotIgnoreFiles = "projectDotIgnoreFiles",
    projectDirMapping = "projectDirMapping",
}


function getConfig<T>(item: ConfigEnum): T | undefined {
    return workspace.getConfiguration("lgf-file-browser").get(item);
}


export class Config {
    filterGlobPatterns: string[] = [];
    projectConfFiles: string[] = [];
    projectDotIgnoreFiles: string[] = [];
    projectDirMapping: { [key: string]: string } = {};

    update() {
        this.filterGlobPatterns = getConfig(ConfigEnum.filterGlobPatterns)!;
        this.projectConfFiles = getConfig(ConfigEnum.projectConfFiles)!;
        this.projectDotIgnoreFiles = getConfig(ConfigEnum.projectDotIgnoreFiles)!;
        this.projectDirMapping = getConfig(ConfigEnum.projectDirMapping)!;
    }
}


export let globalConf = new Config();