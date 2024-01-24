/* eslint-env jest */
// @ts-check
// cSpell:words astify, sqlify

import fs from 'fs';
import path from 'path';
import { Parser } from 'node-sql-parser/build/mysql';
import { db } from 'src/lib/db';

/**
 * Seed the context map for each call with a few common and useful values.
 * @type {ContextMap}
 */
const startingContext = {
  TEST_DATABASE_DBNAME: process.env.TEST_DATABASE_DBNAME || 'am_admin_test',
  DISTRICT_TEST_DATABASE_DBNAME: process.env.DISTRICT_TEST_DATABASE_DBNAME || 'amd_district_test',
};

/**
 * Execute the given sql scripts in the order in which they appear in the array.
 * Empty strings and nulls in the array are ignored.
 * @param {ContextMap} contextMap
 * @param {string | string[]} commands - sql to execute if treatAsFiles is false; filenames to execute if true
 * @param {ParsedPath} pathname
 * @param {boolean} treatAsFiles
 * @return {Promise<void>}
 */
const executeSql = async (contextMap, commands, pathname, treatAsFiles) => {
  /**
   * If variable is an array return it, otherwise return an array containing the variable.
   * @param {string| string[]} variable
   * @returns {string[]}
   */
  const toArray = (variable) => {
    if (Array.isArray(variable)) {
      return variable;
    }
    return [variable];
  };

  /**
   * Go through each line and replace any word surrounded by curly braces with the
   * value key found in the contextMap; e.g., {TEST_DATABASE_DBNAME} becomes
   * whatever contextMap.TEST_DATABASE_DBNAME evaluates to. If the key is not
   * found, the string remains unchanged.
   * @param {string[]} lines
   * @returns {string[]} - each line with the keys replaced
   */
  const replaceWithContext = (lines) => {
    return lines.map((line) => {
      const modified = line?.replaceAll(/\{([A-Za-z0-9_]+)}/g, (_match, key) => {
        return contextMap[key] || `{${key}}`;
      });
      // convert null to empty string
      return modified || '';
    });
  };

  /**
   * @param {string} filename
   * @param {ParsedPath} pathname
   * @return {string}
   */
  const getFullFilename = (filename, pathname) => {
    return `${pathname.dir}/${filename.trim()}`;
  };

  /**
   * @param {string} statements
   * @returns {string[]}
   */
  const splitSql = (statements) => {
    const parser = new Parser();
    const ast = parser.astify(statements);
    return parser
      .sqlify(ast)
      .split(';') // TODO: semicolons not separating statements will break execution
      .map((line) => {
        return line.trim(); // get rid of excess spaces
      }).filter((line) => {
        return line.length > 0; // get rid of empty lines
      });
  };

  /** @typedef { {statements: string[], filename: string} } SqlStatementGroup */
  /**
   * Load sql from file and build an array of sql statements.
   * @param {string} filename
   * @returns {SqlStatementGroup} - list of sql statements in filename
   */
  const fetchSql = (filename) => {
    // load file from disk
    const fileContents = fs.readFileSync(filename).toString();
    // replace any environment variables we find
    const modifiedContents = replaceWithContext([fileContents])[0];
    // return statements associated with filename
    return { statements: splitSql(modifiedContents), filename: filename };
  };

  // skip nulls and blanks
  const actualCommands = toArray(commands).filter((entry) => {
    return entry && entry.trim().length > 0;
  });

  /** @type SqlStatementGroup[] */
  let sqlStatements;
  if (treatAsFiles) {
    // Prisma's executeRaw family of functions only works for a single sql command, so
    // extract arrays of separate sql statements from all given files
    sqlStatements = actualCommands.map((filename) => {
      return fetchSql(getFullFilename(filename, pathname));
    });
  } else {
    // the filenames are really sql statements so execute them directly
    const modifiedCommands = replaceWithContext(actualCommands);
    sqlStatements = [
      {
        // if using raw sql with multiple lines, each string needs to be a complete command
        statements: splitSql(modifiedCommands.join(';')),
        filename: 'raw input',
      },
    ];
  }

  // how many statements do we have to execute?
  const statementCount = sqlStatements
    .map((sqlStatement) => {
      // turn SqlStatementGroup[] into an array of the number of statements in each group
      return sqlStatement.statements.length;
    })
    .reduce((total, len) => {
      // add up all statements
      return total + len;
    }, 0);
  if (statementCount === 0) {
    // nothing to do!
    return;
  }

  /** @type string */
  let currentFilename;
  /** @type string */
  let currentStatement;
  try {
    // execute statements one at a time
    for (const sql of sqlStatements) {
      currentFilename = sql.filename;
      for (const statement of sql.statements) {
        currentStatement = statement;
        // console.log(`Executing ${currentFilename}:${currentStatement}`); // useful for debugging
        await db.$executeRawUnsafe(currentStatement);
      }
    }
  } catch (ex) {
    // annotate error message to give a clue where the error happened
    ex.message = `Error executing sql "${currentStatement}" from ${currentFilename}: ${ex.message}`;
    throw ex;
  } finally {
    await db.$disconnect();
  }
};


/**
 * Create a test that executes sql statements/files before and after execution.
 * @param {jest.It} it
 * @param {string} testPath
 * @param {boolean} treatAsFiles
 * @returns {SqlScenarioTest}
 */
const buildTestSqlScenario = (it, testPath, treatAsFiles) => {
  return (...args) => {
    // process parameters
    /** @type {string} */
    let testName;
    /** @type {ContextMap} */
    let contextMap;
    /** @type {string | string[]} */
    let sqlSetup;
    /** @type {string | string[]} */
    let sqlTeardown;
    /** @type {TestFunction} */
    let testFunc;
    const pathname = path.parse(testPath);

    // fetch arguments
    if (args.length === 5) {
      let providedMap;
      [testName, providedMap, sqlSetup, sqlTeardown, testFunc] = args;
      if (providedMap.describeBlockName) {
        // we are in a describeSqlScenario, so use the map exactly as given rather than a copy
        contextMap = providedMap;
      } else {
        // we are not in a describeSqlScenario and should generate a fresh context map
        contextMap = { ...startingContext, ...providedMap };
      }
    } else if (args.length === 4) {
      [testName, sqlSetup, sqlTeardown, testFunc] = args;
      contextMap = { ...startingContext };
    } else {
      throw new Error(`parameter mismatch in sql${treatAsFiles ? 'File' : ''}Scenario(): ${JSON.stringify(args)}`);
    }

    // build the test
    return it(testName, async () => {
      // run the setup sql outside try/catch so if it fails we don't try and execute the teardown sql
      await executeSql(contextMap, sqlSetup, pathname, treatAsFiles);

      let result; // store the result of the test
      try {
        // actually run the test
        result = await testFunc();
      } finally {
        // always run teardown if we tried to execute the test
        await executeSql(contextMap, sqlTeardown, pathname, treatAsFiles);
      }
      return result;
    });
  };
};

/**
 * Create a Jest describe block that executes sql statements/files before and after execution.
 * @param {jest.Describe} describeFunc
 * @param {string} testPath
 * @param {boolean} treatAsFiles
 * @returns {SqlScenarioDescribe}
 */
const buildDescribeSqlScenario = (describeFunc, testPath, treatAsFiles) => {
  return (...args) => {
    // parameters from describe statement
    /** @type {string} */
    let describeBlockName;
    /** @type {ContextMap} */
    let contextMap;
    /** @type {string | string[]} */
    let sqlSetup;
    /** @type {string | string[]} */
    let sqlTeardown;
    /** @type {DescribeBlockWithContextMap} */
    let describeBlock;
    const pathname = path.parse(testPath);

    // fetch parameters into the local variables
    const blockContext = { describeBlockName: describeBlockName };
    if (args.length === 5) {
      let providedMap;
      [describeBlockName, providedMap, sqlSetup, sqlTeardown, describeBlock] = args;
      // allow passed-in values to override the starting values for context
      contextMap = { ...blockContext, ...startingContext, ...providedMap };
    } else if (args.length === 4) {
      [describeBlockName, sqlSetup, sqlTeardown, describeBlock] = args;
      // always use a fresh copy of startingContext
      contextMap = { ...blockContext, ...startingContext };
    } else {
      throw new Error(`parameter mismatch in describeSql${treatAsFiles ? 'File' : ''}Scenario(): ${JSON.stringify(args)}`);
    }

    return describeFunc(describeBlockName, () => {
      // execute the setup sql before any of the tests in the describe block run
      beforeAll(async () => {
        await executeSql(contextMap, sqlSetup, pathname, treatAsFiles);
      });

      // execute the teardown sql after all the tests in the describe block run
      afterAll(async () => {
        await executeSql(contextMap, sqlTeardown, pathname, treatAsFiles);
      });

      // build the tests in the describe block, passing the contextMap
      describeBlock(contextMap);
    });
  };
};

global.sqlScenario = buildTestSqlScenario(global.it, global.testPath, false);
global.sqlScenario.only = buildTestSqlScenario(global.it.only, global.testPath, false);
global.sqlScenario.failing = buildTestSqlScenario(global.it.failing, global.testPath, false);
global.sqlScenario.skip = buildTestSqlScenario(global.it.skip, global.testPath, false);
global.sqlFileScenario = buildTestSqlScenario(global.it, global.testPath, true);
global.sqlFileScenario.only = buildTestSqlScenario(global.it.only, global.testPath, true);
global.sqlFileScenario.failing = buildTestSqlScenario(global.it.failing, global.testPath, true);
global.sqlFileScenario.skip = buildTestSqlScenario(global.it.skip, global.testPath, true);

global.describeSqlScenario = buildDescribeSqlScenario(global.describe, global.testPath, false);
global.describeSqlScenario.skip = buildDescribeSqlScenario(global.describe.skip, global.testPath, false);
global.describeSqlScenario.only = buildDescribeSqlScenario(global.describe.only, global.testPath, false);
global.describeSqlFileScenario = buildDescribeSqlScenario(global.describe, global.testPath, true);
global.describeSqlFileScenario.skip = buildDescribeSqlScenario(global.describe.skip, global.testPath, true);
global.describeSqlFileScenario.only = buildDescribeSqlScenario(global.describe.only, global.testPath, true);
