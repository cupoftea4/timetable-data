import { doStudentScheduleParsing, doSelectiveParsing, doLecturerParsing, doExamsScheduleParsing } from './utils/update-data.js';

doStudentScheduleParsing().then(
  () => doSelectiveParsing()).then(
    () => doLecturerParsing()).then(
      () => doExamsScheduleParsing());