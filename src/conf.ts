import { workspace } from "vscode";


enum ConfigEnum {
    filterFilePatterns = "filterFilePatterns",
    filterProjectFileGlobPatterns = "filterProjectFileGlobPatterns",
    projectConfFiles = "projectConfFiles"
}


function getConfig<T>(item: ConfigEnum): T | undefined {
    return workspace.getConfiguration("lgf-file-browser").get(item);
}


export class Config {
    filterPatterns: RegExp[] = [];
    filterProjectFileGlobPatters: string[] = [];
    projectConfFiles: string[] = [];

    update() {
        let filterPatternsStr: string[] = getConfig(ConfigEnum.filterFilePatterns)!;
        this.filterPatterns = filterPatternsStr.map(
            s => new RegExp(s)
        );
        this.filterProjectFileGlobPatters = getConfig(ConfigEnum.filterProjectFileGlobPatterns)!;
        this.projectConfFiles = getConfig(ConfigEnum.projectConfFiles)!;
    }
}