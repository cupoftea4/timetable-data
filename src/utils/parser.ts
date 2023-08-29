import axios from 'axios';
import jsdom from "jsdom";
const { JSDOM } = jsdom;

const NULP_STUDENTS = "https://student.lpnu.ua/";
const NULP_STAFF = "https://staff.lpnu.ua/";

let timetableSuffix = "students_schedule";

export function setSuffix(suffix: string) {
	timetableSuffix = suffix;
}

function buildUrl(params: Record<string, string> = {}, base = NULP_STUDENTS) {
	let baseUrl = base + timetableSuffix;
	const url = new URL(baseUrl);
	for (let key in params) {
		url.searchParams.set(key, params[key])
	}
	return url;
}

function fetchHtml(params = {}, url = NULP_STUDENTS) {
	return axios
    .get(buildUrl(params, url).toString(), {
      responseType: "text",
    })
    .then((response) => response.data);
}

export async function getInstitutes() {
	return fetchHtml().then(html => {
		const select = parseAndGetOne(html, "#edit-departmentparent-abbrname-selective");
		const institutes = Array.from(select?.children ?? [])
			.map(child => (child as HTMLInputElement).value)
			.filter(inst => inst !== "All")
			.sort((a, b) => a.localeCompare(b));
		return institutes;
	}).catch(console.warn)
}

export async function getLecturers(department: string | null = null) {
	return fetchHtml(department ? 
		{department_name_selective: department} : {}, NULP_STAFF).then(html => {
		const select = parseAndGetOne(html, "#edit-teachername-selective");
		const lecturers = Array.from(select?.children ?? [])
								.map(child => (child as HTMLInputElement).value)
								.filter(inst => inst !== "All")
								.sort((a, b) => a.localeCompare(b));
		return lecturers;
	}).catch(err => {
		console.warn("Couldn't parse lecturers: " + err);
	});
}

 export async function getLecturerDepartments() {
		return fetchHtml({}, NULP_STAFF).then(html => {
			const select = parseAndGetOne(html, "#edit-department-name-selective");
			const departments = Array.from(select?.children ?? [])
				.map(child => (child as HTMLInputElement).value)
				.filter(depart => depart !== "All")
				.sort((a, b) => a.localeCompare(b));
			return departments;
		}).catch(err => {
			console.warn("Couldn't parse departments: " + err);
		});
	}

	export function prepareTimetableRequest(timetableName = "All", timetableCategory = "All", isLecturers = false) {
		let params = {};
		if (isLecturers) {
			params = {
				department_name_selective: timetableCategory,
				teachername_selective: timetableName,
				semestr_selective: '2',
				assetbuilding_name_selective: "весь семестр"
			};
		} else {
			params = {
				departmentparent_abbrname_selective: timetableCategory,
				studygroup_abbrname_selective: timetableName,
				semestrduration: '1', // Why, NULP?
			};			
		}

		return {
			method: 'GET',
			url: buildUrl(params, isLecturers ? NULP_STAFF : NULP_STUDENTS).toString(),
			responseType: 'text',
		} as const;
	}

	export function prepareExamsTimetableRequest(timetableName = "All", timetableCategory = "All", isLecturers = false) {
		let params = {};
		if (isLecturers) {
			params = {
				namedepartment_selective: timetableCategory,
				teachername_selective: timetableName
			};
		}  else {
			params = {
				departmentparent_abbrname_selective: timetableCategory,
				studygroup_abbrname_selective: timetableName
			};
		}

		return {
			method: 'GET',
			url: buildUrl(params, isLecturers ? NULP_STAFF : NULP_STUDENTS).toString(),
			responseType: 'text',
		} as const;
	}


export async function getGroups(departmentparent_abbrname_selective = "All") {
	return fetchHtml({ departmentparent_abbrname_selective }).then(html => {
		const select = parseAndGetOne(html, "#edit-studygroup-abbrname-selective");
		const groups = Array.from(select?.children ?? [])
			.map(child => (child as HTMLInputElement).value)
			.filter(inst => inst !== "All")
			.sort((a, b) => a.localeCompare(b));
		return groups;
	}).catch(console.warn)
}

export function parseTimetable(html: string) {
	const content = parseAndGetOne(html, ".view-content");
	const days = Array.from(content?.children ?? [])
		.map(parseDay)
		.flat(1);
	return days;
}

export function parseExamsTimetable(html: string) {
	const content = parseAndGetOne(html, ".view-content");
	const exams = Array.from(content?.children ?? [])
						.map(parseExam)
	if (exams.length === 0) throw Error("Exams timetable is empty");
	return exams;
}

function parseExam(exam: Element) {
	const dayText = exam.querySelector(".view-grouping-header");
	if(!dayText) {
		throw Error("Got wrong DOM structure for exam!");
	}
	const date = new Date(dayText.textContent ?? "");
	let lecturer = "", subject = "", number = 0, urls: string[] = [];
	const contentChildren = exam.querySelector(".view-grouping-content")?.children ?? [];

	[...contentChildren].forEach(child => {
		// it's h3 with lesson number
		if (!child.classList.contains("stud_schedule")) { 
			number = parseInt(child.textContent ?? "0");
		// it's stud_schedule with lesson info
		} else { 																					
			const examContent = child.querySelector(".group_content");
			if(!examContent) {
				throw Error("Got wrong DOM structure for exam!");
			}
			[...examContent.childNodes].forEach(node => {
				// lecturer and subject are in text nodes
				if(node?.textContent) {
					const text = node.textContent?.trim();
					if(!text) return;
					if(!subject) subject = text; 
					else if(!lecturer) lecturer = text;
				}
				// urls are in a tags
				if(node?.nodeType === 1) {
					const a = (node as Element).querySelector("a");
					if(a) urls.push(a.href);
				}
			});
		}
	});

	return {
		date,
		lecturer,
		subject,
		number,
		urls
	};
}

/*
	day
		header
		content
			h3
			stud_schedule
			h3
			stud_schedule
			...
*/

function parseDay(day: Element) {
	const dayText = day.querySelector(".view-grouping-header");
	if (!dayText) {
		throw Error("Got wrong DOM structure for day!");
	}
	const dayNumber = dayToNumber(dayText.textContent);
	const contentChildren = day.querySelector(".view-grouping-content")?.children ?? [];

	let dayLessons: any[] = [];

	let currentLessonNumber = 0;
	for (let i = 0; i < contentChildren.length; i++) {
		const child = contentChildren[i];
		if (child.classList.contains("stud_schedule")) {
			const lessons = parsePair(child);
			if (currentLessonNumber === 0) console.warn("Lesson number is 0!", child)
			lessons.forEach(lesson => {
				lesson.day = dayNumber;
				lesson.number = currentLessonNumber;
			})
			dayLessons = dayLessons.concat(lessons);
		} else {
			currentLessonNumber = Number.parseInt(child.textContent ?? "0");
		}
	}
	return dayLessons;
}

function parsePair(pair: Element) {
	const lessonElements = pair.querySelectorAll(".group_content");
	const lessons = [];

	for (let element of lessonElements) {
		const id = element.parentElement?.id;
		const meta = parseLessonId(id ?? "");

		const data = parseLessonData(element);

		/*
			isFirstWeek
			isSecondWeek
			isFirstSubgroup
			isSecondSubgroup
			type
			subject
			lecturer
			location
			day
			number
		*/

		const lesson = {
			...data,
			type: tryToGetType(data.location),
			...meta,
			day: -1,
			number: -1
		};
		lessons.push(lesson);
	}

	return lessons;
}

function parseLessonData(element: Element) {
	const texts = []
	let lessonUrls = [];
	let br = false;
	for (let node of Array.from(element.childNodes)) {
		if (node.nodeName === "BR") {
			if (br) texts.push(""); //sometimes text is skipped with sequenced <br/> 
			br = true;
		} else if (node.nodeName === "SPAN") {
			lessonUrls.push((node as Element).querySelector("a")?.href);
			br = false;
		} else {
			br = false;
			texts.push(node.textContent)
		}
	}
	return {
		subject: texts[0] || "",
		lecturer: texts[1] || "",
		location: texts[2] || "",
		urls: lessonUrls,
	}
}

function parseLessonId(id: string) {
	const split = id.split("_");
	let subgroup: number | "all" = "all";
	let week = "full";
	if (id.includes("sub")) {
		subgroup = Number.parseInt(split[1]);
	}
	week = split[split.length - 1];
	return {
		isFirstWeek: week === "full" || week === "chys",
		isSecondWeek: week === "full" || week === "znam",
		isFirstSubgroup: subgroup === "all" || subgroup === 1,
		isSecondSubgroup: subgroup === "all" || subgroup === 2,
	}
}

function tryToGetType(location: string) {
	location = location.toLowerCase();
	if (location.includes("практична")) return "practical";
	if (location.includes("лабораторна")) return "lab";
	if (location.includes("конс.")) return "consultation";
	return "lection";
}

function dayToNumber(day: string | null) {
	switch (day?.toLowerCase()) {
		case "пн":
			return 1;
		case "вт":
			return 2;
		case "ср":
			return 3;
		case "чт":
			return 4;
		case "пт":
			return 5;
		case "сб":
			return 6;
		case "нд":
			return 7;
		default:
			return -1;
	}
}

function parseAndGetOne(html: string, css: string) {
	const { document } = (new JSDOM(html)).window;
	return document.querySelector(css);
}

const parser = {
	fetchHtml,
	getInstitutes,
	getGroups,
	prepareTimetableRequest,
	parseTimetable,
	setSuffix,
}

export default parser;
