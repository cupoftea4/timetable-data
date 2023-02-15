import { mkdirSync, writeFile as _writeFile } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

import { 
    setSuffix,
    prepareTimetableRequest, 
    prepareExamsTimetableRequest,
    parseTimetable, 
    parseExamsTimetable,
    getGroups, 
    getInstitutes,
    getLecturers,
    getLecturerDepartments
} from "./parser.js";

const MAX_PARALLEL_REQUESTS = 10;

const dir = "data";
const exportPath = join(dirname(fileURLToPath(import.meta.url)), dir);
const instituteDir = "institutes";
const timetableDir = "timetables";
const lecturerDir = "lecturers";
const examsDir = "exams";
const lecturerExamsDir = "exams/lecturers";

const selectiveDir = "selective";
const selectiveSuffix = "schedule_selective";
const lecturerSuffix = "lecturer_schedule";
const examsSuffix = "students_exam";
const lecturerExamsSuffix = "lecturer_exam";

const getTime = () => new Date().toLocaleTimeString();

// doStudentScheduleParsing().then(() => doSelectiveParsing()).then(() => doLecturerParsing());
doExamsScheduleParsing();
// doStudentScheduleParsing();
// doLecturerParsing()
// doSelectiveParsing();

async function doStudentScheduleParsing() {
    console.log("Downloading student schedule")
    let institutes = await downloadInstitutes().catch(err => {
        console.log("Got error while downloading institutes:", err);
        process.exit(1);
    })
    writeFile(join(exportPath, "institutes.json"), JSON.stringify(institutes, null, 4));

    for (let institute of institutes) {
        await downloadGroups(institute).then(async groups => {
            writeFile(join(exportPath, instituteDir, institute + ".json"), JSON.stringify(groups, null, 4));
        })
    }

    let groups = await downloadGroups().catch(err => {
        console.log("Got error while downloading groups:", err);
        process.exit(1);
    });
    groups = groups.map(el => el.trim());
    writeFile(join(exportPath, "groups.json"), JSON.stringify(groups, null, 4));

    await fetchTimetables(groups, timetableDir);

    console.log("Done!");
}

async function doExamsScheduleParsing() {
    let groups;

    console.log("Downloading exams schedule for students");
    groups = await getExamsGroups().catch(err => {
        console.log("Got error while downloading groups:", err);
        process.exit(1);
    });
    groups = groups.map(el => el.trim());

    setSuffix(examsSuffix);
    await fetchTimetables(groups, examsDir);

    console.log("Downloading exams schedule for lecturers");
    groups = await getLecturerExamsGroups().catch(err => {
        console.log("Got error while downloading groups:", err);
        process.exit(1);
    });
    groups = groups.map(el => el.trim());

    setSuffix(lecturerExamsSuffix);
    await fetchTimetables(groups, lecturerExamsDir);

    console.log("Done!");
}

async function doSelectiveParsing() {
    console.log("Downloading selective schedule")
    setSuffix(selectiveSuffix);

    let groups = await downloadGroups().catch(err => {
        console.log("Got error while downloading groups:", err);
        process.exit(1);
    });
    groups = groups.map(el => el.trim());
    writeFile(join(exportPath, selectiveDir, "groups.json"), JSON.stringify(groups, null, 4));

    await fetchTimetables(groups, join(selectiveDir, timetableDir));
    console.log("Done!")
}

async function doLecturerParsing() {
    setSuffix(lecturerSuffix);
    
    console.log("Downloading departments for lecturer schedule")
    let departments = await getLecturerDepartments().catch(err => {
        console.log("Got error while lecturer departments:", err);
        process.exit(1);
    });
    departments = departments.map(el => el.trim());
    writeFile(join(exportPath, lecturerDir, "departments.json"), JSON.stringify(departments, null, 4));

    const lecturersByDepartment = {};
    for (let department of departments) {
        console.log("Downloading lecturers from " + department);
        await getLecturers(department).then(async lecturers => {
            lecturers = lecturers.map(el => el.trim());
            lecturersByDepartment[department] = lecturers;
        }).catch(err => {
            console.log("Got error while lecturers from " + department, err);
        })
    }
    writeFile(join(exportPath, lecturerDir, "grouped.json"), JSON.stringify(lecturersByDepartment, null, 4));

    const lecturers = Object.values(lecturersByDepartment).flat();
    writeFile(join(exportPath, lecturerDir, "all.json"), JSON.stringify(lecturers, null, 4));

    await fetchTimetables(lecturers, join(lecturerDir, timetableDir));

    console.log("Done!")
}

async function fetchTimetables(groups, dir) {
    let requests;
    if (dir.includes("exams")) {
        requests = groups.map((group) => prepareExamsTimetableRequest(group, undefined, dir.includes("lecturer")));
    } else {
        requests = groups.map((group) => prepareTimetableRequest(group, undefined, dir.includes("lecturer")));
    }
    const requestQueue = [];
    let currentPosition = 0;
    for (; currentPosition < MAX_PARALLEL_REQUESTS; currentPosition++) {
        requestQueue.push(axios(requests[currentPosition]));
    }

    while (requestQueue.length) {
        const request = await requestQueue.shift();
        handleResponse(request, dir);
        if (currentPosition < requests.length) {
            requestQueue.push(axios(requests[currentPosition]));
            currentPosition++;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}

function handleResponse(element, dir) {
    const url = new URL(element.config.url);
    const group = url.searchParams.get('studygroup_abbrname_selective') || url.searchParams.get('teachername_selective');
    console.log(`[${getTime()}] Parsing ${group}`);
    if (element.error) {
        console.error(element.error);
        return;
    }

    try {
        const timetable = (dir.includes("exams")) 
            ? parseExamsTimetable(element.data) 
            : parseTimetable(element.data);
        writeFile(join(exportPath, dir, group + ".json"), JSON.stringify(timetable, null, 4));
    } catch (e) {
        console.error(e);
    }
}

async function downloadGroups(institute) {
    console.log("Downloading groups " + (institute || ""))
    let groups = await getGroups(institute)
    groups.sort(localeCompare);
    return groups;
}

async function downloadInstitutes() {
    console.log("Downloading institutes");
    let inst = await getInstitutes()
    inst.sort(localeCompare);
    return inst;
}

function getExamsGroups() {
    setSuffix(examsSuffix);
    return getGroups();
} 

function getLecturerExamsGroups() {
    setSuffix(lecturerExamsSuffix);
    return getLecturers();
}

function writeFile(filePath, contents) {
    mkdirSync(dirname(filePath), { recursive: true });

    _writeFile(filePath, contents, err => {
        if (err) console.log("Error: ", err);
    });
}

function localeCompare(a, b) {
    return a.localeCompare(b);
}