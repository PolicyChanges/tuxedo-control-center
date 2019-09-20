import { Injectable } from '@angular/core';

import { TccPaths } from '../../common/classes/TccPaths';
import { ITccSettings } from '../../common/models/TccSettings';
import { ITccProfile } from '../../common/models/TccProfile';
import { ConfigHandler } from '../../common/classes/ConfigHandler';
import { environment } from '../environments/environment';
import { ElectronService } from 'ngx-electron';
import { Observable, Subject } from 'rxjs';
import { UtilsService } from './utils.service';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {

  private config: ConfigHandler;

  private defaultProfiles: ITccProfile[];
  private customProfiles: ITccProfile[];
  private settings: ITccSettings;

  private currentProfileEdit: ITccProfile;
  private currentProfileEditIndex: number;

  public observeSettings: Observable<ITccSettings>;
  private settingsSubject: Subject<ITccSettings>;

  public observeEditingProfile: Observable<ITccProfile>;
  private editingProfileSubject: Subject<ITccProfile>;

  // Exporting of relevant functions from ConfigHandler
  // public copyConfig = ConfigHandler.prototype.copyConfig;
  // public writeSettings = ConfigHandler.prototype.writeSettings;

  constructor(private electron: ElectronService, utils: UtilsService) {
    this.settingsSubject = new Subject<ITccSettings>();
    this.observeSettings = this.settingsSubject.asObservable();

    this.editingProfileSubject = new Subject<ITccProfile>();
    this.observeEditingProfile = this.editingProfileSubject.asObservable();

    this.config = new ConfigHandler(TccPaths.SETTINGS_FILE, TccPaths.PROFILES_FILE, TccPaths.AUTOSAVE_FILE);
    this.defaultProfiles = this.config.getDefaultProfiles();
    for (const profile of this.defaultProfiles) {
      utils.fillDefaultValuesProfile(profile);
    }
    this.readFiles();
  }

  public readFiles(): void {
    this.customProfiles = this.config.getCustomProfilesNoThrow();
    this.settings = this.config.getSettingsNoThrow();
    this.settingsSubject.next(this.settings);
  }

  public getSettings(): ITccSettings {
    return this.settings;
  }

  public getCustomProfiles(): ITccProfile[] {
    return this.customProfiles;
  }

  public getDefaultProfiles(): ITccProfile[] {
    return this.defaultProfiles;
  }

  public getAllProfiles(): ITccProfile[] {
    return this.defaultProfiles.concat(this.getCustomProfiles());
  }

  public setActiveProfile(profileName: string, stateId: string): void {
    // Copy existing current settings and set name of new profile
    const newSettings: ITccSettings = this.config.copyConfig<ITccSettings>(this.getSettings());

    newSettings.stateMap[stateId] = profileName;
    const tmpSettingsPath = '/tmp/tmptccsettings';
    this.config.writeSettings(newSettings, tmpSettingsPath);
    let tccdExec: string;
    if (environment.production) {
      tccdExec = TccPaths.TCCD_EXEC_FILE;
    } else {
      tccdExec = this.electron.process.cwd() + '/dist/tuxedo-control-center/data/service/tccd';
    }
    const result = this.electron.ipcRenderer.sendSync(
      'exec-cmd-sync', 'pkexec ' + tccdExec + ' --new_settings ' + tmpSettingsPath
    );
    this.readFiles();
  }

  public copyProfile(profileName: string, newProfileName: string): boolean {
    const profileToCopy: ITccProfile = this.getProfileByName(profileName);
    if (profileToCopy === undefined) { return false; }
    const existingProfile = this.getProfileByName(newProfileName);
    if (existingProfile !== undefined) { return false; }

    const newProfile: ITccProfile = this.config.copyConfig<ITccProfile>(profileToCopy);
    newProfile.name = newProfileName;
    const newProfileList = this.getCustomProfiles().concat(newProfile);
    const result = this.pkexecWriteCustomProfiles(newProfileList);
    if (result) { this.readFiles(); }
    return result;
  }

  public deleteCustomProfile(profileNameToDelete: string): boolean {
    const newProfileList: ITccProfile[] = this.getCustomProfiles().filter(profile => profile.name !== profileNameToDelete);
    if (newProfileList.length === this.getCustomProfiles().length) { return false; }
    const result = this.pkexecWriteCustomProfiles(newProfileList);
    if (result) { this.readFiles(); }
    return result;
  }

  public pkexecWriteCustomProfiles(customProfiles: ITccProfile[]) {
    const tmpProfilesPath = '/tmp/tmptccprofiles';
    this.config.writeProfiles(customProfiles, tmpProfilesPath);
    let tccdExec: string;
    if (environment.production) {
      tccdExec = TccPaths.TCCD_EXEC_FILE;
    } else {
      tccdExec = this.electron.process.cwd() + '/dist/tuxedo-control-center/data/service/tccd';
    }
    const result = this.electron.ipcRenderer.sendSync(
      'exec-cmd-sync', 'pkexec ' + tccdExec + ' --new_profiles ' + tmpProfilesPath
    );
    return result.error === undefined;
  }

  public writeCurrentEditingProfile(): boolean {
    if (this.editProfileChanges()) {
      const changedCustomProfiles: ITccProfile[] = this.config.copyConfig<ITccProfile[]>(this.customProfiles);
      changedCustomProfiles[this.currentProfileEditIndex] = this.getCurrentEditingProfile();

      const result = this.pkexecWriteCustomProfiles(changedCustomProfiles);
      if (result) { this.readFiles(); }

      return result;
    } else {
      return false;
    }
  }

  /**
   * Retrieves the currently chosen profile for edit
   *
   * @returns undefined if no profile is set, the profile otherwise
   */
  public getCurrentEditingProfile(): ITccProfile {
    return this.currentProfileEdit;
  }

  public getProfileByName(searchedProfileName: string): ITccProfile {
    const foundProfile: ITccProfile = this.getAllProfiles().find(profile => profile.name === searchedProfileName);
    if (foundProfile !== undefined) {
      return this.config.copyConfig<ITccProfile>(foundProfile);
    } else {
      return undefined;
    }
  }

  public getCustomProfileByName(searchedProfileName: string): ITccProfile {
    const foundProfile: ITccProfile = this.getCustomProfiles().find(profile => profile.name === searchedProfileName);
    if (foundProfile !== undefined) {
      return this.config.copyConfig<ITccProfile>(foundProfile);
    } else {
      return undefined;
    }
  }

  /**
   * Checks if the current edit profile has changes compared to the currently saved
   *
   * @returns true if there are changes, false if there are no changes or no profile
   *          is chosen for edit
   */
  public editProfileChanges(): boolean {
    if (this.currentProfileEdit === undefined) { return false; }
    const currentSavedProfile: ITccProfile = this.customProfiles[this.currentProfileEditIndex];
    // Compare the two profiles
    return JSON.stringify(this.currentProfileEdit) !== JSON.stringify(currentSavedProfile);
  }

  /**
   * Set the current profile to edit. Effectively makes a new copy of the chosen profile
   * for edit and compare with current profile values. Overwrites any current changes.
   *
   * @param customProfileName Profile name used to look up the profile
   * @returns false if the name doesn't exist among the custom profiles, true if successfully set
   */
  public setCurrentEditingProfile(customProfileName: string): boolean {
    if (customProfileName === undefined) {
      this.currentProfileEditIndex = -1;
      this.currentProfileEdit = undefined;
      this.editingProfileSubject.next(undefined);
    }
    const index = this.currentProfileEditIndex = this.customProfiles.findIndex(e => e.name === customProfileName);
    if (index === -1) {
      return false;
    } else {
      this.currentProfileEditIndex = index;
      this.currentProfileEdit = this.config.copyConfig<ITccProfile>(this.customProfiles[index]);
      this.editingProfileSubject.next(this.currentProfileEdit);
      return true;
    }
  }
}
