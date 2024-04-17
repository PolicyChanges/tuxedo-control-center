import * as builder from 'electron-builder';
import * as util from 'util';
import * as child_process from 'child_process';
const execp = util.promisify(child_process.exec);

const tccPackage = require('../package.json');

async function getGitDescribe() {
    return (await execp("git describe")).stdout.trim();
}

async function getCurrentBranch() {
    return (await execp('git branch --show-current')).stdout.trim();
}

async function setVersion(version: string) {
    version.replace('"', '');
    await execp(`npm run ver "${version} --allow-same-version"`);
}

/**
 * buildSteps is the List with the builds
 */
const buildSteps: Array<(filenameAddition: string) => Promise<void>> = [];

const distSrc = './dist/tuxedo-control-center';

/**
 * Parse command line parameter and set up the build
 */
let automaticVersion = false;

process.argv.forEach((parameter, index, array) => {
    if (parameter.startsWith('deb')) {
        buildSteps.push(buildDeb);
    }

    if (parameter.startsWith('rpm')) {
        buildSteps.push(buildRpm);
    }

    if (parameter.startsWith('all')) {
        buildSteps.push(buildDeb);
        buildSteps.push(buildRpm);
    }

    if (parameter.startsWith('autoversion')) {
        automaticVersion = true;
    }
});

/**
 * Function for create the deb Package
 */
async function buildDeb(filenameAddition: string): Promise<void> {
    const config = {
        appId: 'tuxedocontrolcenter',
        artifactName: '${productName}_${version}' + filenameAddition + '.${ext}',
        directories: {
            output: './dist/packages'
        },

        files: [
            distSrc + '/**/*'
        ],
        extraResources: [
            distSrc + '/data/service/tccd',
            distSrc + '/data/service/TuxedoIOAPI.node',
            distSrc + '/data/CHANGELOG.md',
            distSrc + '/data/dist-data/tccd.service',
            distSrc + '/data/dist-data/tccd-sleep.service',
            distSrc + '/data/dist-data/tuxedo-control-center_256.svg',
            distSrc + '/data/dist-data/tuxedo-control-center.desktop',
            distSrc + '/data/dist-data/tuxedo-control-center-tray.desktop',
            distSrc + '/data/dist-data/com.tuxedocomputers.tccd.policy',
            distSrc + '/data/dist-data/com.tuxedocomputers.tccd.conf',
            distSrc + '/data/camera/cameractrls.py',
            distSrc + '/data/dist-data/99-webcam.rules',
            distSrc + '/data/dist-data/com.tuxedocomputers.tomte.policy',
            distSrc + '/data/camera/v4l2_kernel_names.json'
        ],
        linux: {
            target: [
                'deb'
            ],
            category: 'System',
            icon: distSrc + '/data/dist-data/tuxedo-control-center_256.svg',
        },
        deb: {
            depends: ['tuxedo-drivers (>= 4.0.0) | tuxedo-keyboard (>= 3.1.2)', 'libayatana-appindicator3-1'],
            category: 'System',
            afterInstall: "./build-src/after_install.sh",
            afterRemove: "./build-src/after_remove.sh",
            fpm: [
                '--conflicts=tuxedofancontrol',
                '--replaces=tuxedofancontrol',
                '--inputs=build-src/package-files.txt'
            ]
        }
    };
    console.log('\x1b[36m%s\x1b[0m', 'Create Deb Package');
    console.log('config', config);
    await builder.build({
        targets: builder.Platform.LINUX.createTarget(),
        config
    })
    .then((result) => {
        console.log('BUILD SUCCESS');
        console.log(result);
    })
    .catch((error) => {
        console.log('ERROR at BUILD');
        console.log(error);
    });
}

/**
 * Function for create the Suse RPM Package
 */
async function buildRpm(filenameAddition: string): Promise<void> {
    const config: builder.Configuration = {
        appId: 'tuxedocontrolcenter',
        artifactName: '${productName}_${version}' + filenameAddition + '.${ext}',
        directories: {
            output: './dist/packages'
        },
        files: [
            distSrc + '/**/*'
        ],
        extraResources: [
            distSrc + '/data/service/tccd',
            distSrc + '/data/service/TuxedoIOAPI.node',
            distSrc + '/data/dist-data/tccd.service',
            distSrc + '/data/dist-data/tccd-sleep.service',
            distSrc + '/data/dist-data/tuxedo-control-center_256.svg',
            distSrc + '/data/dist-data/tuxedo-control-center.desktop',
            distSrc + '/data/dist-data/tuxedo-control-center-tray.desktop',
            distSrc + '/data/dist-data/com.tuxedocomputers.tccd.policy',
            distSrc + '/data/dist-data/com.tuxedocomputers.tccd.conf',
            distSrc + '/data/camera/cameractrls.py',
            distSrc + '/data/camera/v4l2_kernel_names.json',
            distSrc + '/data/dist-data/99-webcam.rules'
        ],
        linux: {
            target: [
                'rpm'
            ],
            category: 'System',
            icon: distSrc + '/data/dist-data/tuxedo-control-center_256.svg',
        },
        rpm: {
            depends: ['(tuxedo-drivers >= 4.0.0 or tuxedo-keyboard >= 3.1.2)', '(libayatana-appindicator3-1 or libappindicator or libappindicator3-1)'],
            afterInstall: './build-src/dummy.sh',
            afterRemove: './build-src/after_remove.sh',
            fpm: [
                '--replaces=tuxedofancontrol <= 0.1.9',
                '--rpm-posttrans=./build-src/after_install.sh',
                '--inputs=build-src/package-files.txt',
                '--rpm-tag=%define _build_id_links none'
            ]
        }
    };

    console.log('\x1b[36m%s\x1b[0m', 'Create Suse RPM Package');
    console.log('config', config);
    await builder.build({
        targets: builder.Platform.LINUX.createTarget(),
        config
    })
    .then((result) => {
        console.log('BUILD SUCCESS');
        console.log(result);
    })
    .catch((error) => {
        console.log('ERROR at BUILD');
        console.log(error);
    });
}

/**
 * Execute all Builds in the buildSteps List
 */
async function startBuild() {
    console.log('Start packaging');
    const previousVersion = tccPackage.version;
    try {
        let gitDescribe = await getGitDescribe();
        let gitBranch = await getCurrentBranch();
        let version = gitDescribe.slice(1);
        let filenameAddition = '';

        const addBranchNameToFilename = version.includes('-') &&
                                        gitBranch !== '';

        if (addBranchNameToFilename) {
            filenameAddition = `_${gitBranch}`;
        }

        if (automaticVersion) {
            console.log(`Set build version: '${version}'`);
            await setVersion(version);
        }

        for (const step of buildSteps) {
            console.log('Build step: ' + step.name);
            await step(filenameAddition);
            console.log('\n');
        }

    } catch (err) {
        console.log('Error on build => ' + err);
        process.exit(1);
    } finally {
        if (automaticVersion) {
            await setVersion(previousVersion);
        }
    }
}

startBuild();
