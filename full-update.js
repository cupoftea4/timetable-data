import { doStudentScheduleParsing, doSelectiveParsing, doLecturerParsing, doExamsScheduleParsing } from './data.js';

doStudentScheduleParsing().then(
  () => doSelectiveParsing()).then(
    () => doLecturerParsing()).then(
      () => doExamsScheduleParsing());