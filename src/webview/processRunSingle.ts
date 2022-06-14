import { Problem, RunResult } from '../types';
import { getLanguage } from '../utils';
import { getBinSaveLocation, compileFile } from '../compiler';
import { saveProblem } from '../parser';
import { runTestCase, deleteBinary } from '../executions';
import { isResultCorrect } from '../judge';
import * as vscode from 'vscode';
import { getJudgeViewProvider } from '../extension';
import { getIgnoreSTDERRORPref } from '../preferences';

import path from 'path';
import fs, { mkdirSync, writeFileSync } from 'fs';

export const runSingleAndSave = async (
    problem: Problem,
    id: number,
    skipCompile = false,
) => {
    console.log('Run and save started', problem, id);
    const srcPath = problem.srcPath;
    const language = getLanguage(srcPath);
    const binPath = getBinSaveLocation(srcPath);
    const idx = problem.tests.findIndex((value) => value.id === id);
    const testCase = problem.tests[idx];

    const textEditor = await vscode.workspace.openTextDocument(srcPath);
    await vscode.window.showTextDocument(textEditor, vscode.ViewColumn.One);
    await textEditor.save();

    if (!testCase) {
        console.error('Invalid id', id, problem);
        return;
    }

    saveProblem(srcPath, problem);

    if (!skipCompile) {
        if (!(await compileFile(srcPath))) {
            console.error('Failed to compile', problem, id);
            return;
        }
    }

    const run = await runTestCase(language, binPath, testCase.input);

    if (!skipCompile) {
        deleteBinary(language, binPath);
    }

    const stderrorFailure = getIgnoreSTDERRORPref() ? false : run.stderr !== '';

    const didError =
        (run.code !== null && run.code !== 0) ||
        run.signal !== null ||
        stderrorFailure;
    const result: RunResult = {
        ...run,
        pass: didError ? false : isResultCorrect(testCase, run.stdout),
        id,
    };

    console.log('Testcase judging complete. Result:', result);
    getJudgeViewProvider().extensionToJudgeViewMessage({
        command: 'run-single-result',
        result,
        problem,
    });

    const archiveFolderPath = vscode.workspace
        .getConfiguration('cph')
        .get('general.archiveFolderLocation') as string;
    if (archiveFolderPath) {
        saveProblemInArchiveFolder(srcPath, archiveFolderPath, problem);
    }
};

const saveProblemInArchiveFolder = (
    srcPath: string,
    archiveFolderPath: string,
    problem: Problem,
) => {
    const fileName = path.basename(srcPath)
        ? path.basename(srcPath)
        : 'temp.txt';
    const x = problem.group.indexOf('-');
    let contestSite = 'local';
    let contestName = problem.group;

    if (x != -1) {
        contestSite = problem.group.substring(0, x).trim();
        contestName = problem.group.substring(x + 1).trim();
    }

    const wordsInText = function (text: string) {
        const regex = /[\p{L}-]+|[0-9]+/gu;
        return text.match(regex);
    };

    const removeBadChars = function (str: string) {
        const words = wordsInText(str);
        if (words === null) {
            return `${str.replace(/\W+/g, '_')}`;
        } else {
            return `${words.join('_')}`;
        }
    };

    contestName = removeBadChars(contestName);
    contestSite = removeBadChars(contestSite);

    const newPath = path.join(archiveFolderPath, contestSite, contestName);

    try {
        if (!fs.existsSync(newPath)) {
            console.log('Making folder for archive file.');
            mkdirSync(newPath, { recursive: true });
        }
        const fileContents = fs.readFileSync(srcPath).toString();
        writeFileSync(path.join(newPath, fileName), fileContents);
        console.log('Successfully saved ' + fileName + ' in archive');
    } catch (err) {
        vscode.window.showInformationMessage(
            'Cannot save ' + fileName + ' in archive.\n' + String(err),
        );
    }
};
