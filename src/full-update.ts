import { doStudentScheduleParsing, doSelectiveParsing, doLecturerParsing, doExamsScheduleParsing } from './update-data.js';

doStudentScheduleParsing().then(
  () => doSelectiveParsing()).then(
    () => doLecturerParsing()).then(
      () => doExamsScheduleParsing());