/**
 * Represents a context map, which is a collection of key-value pairs where the key is a string and the value is a string.
 * The context block is used to provide values that can be replaced in sql statements before execution.
 */
interface ContextMap {
  [property: string]: string;
}

/**
 * Create a Jest test that executes SQL statements before and after executing.
 *
 * @param {string} testName - The name of the test.
 * @param {string|string[]} sqlSetup - The SQL statements or files to be executed before running the scenario.
 * @param {string|string[]} sqlTeardown - The SQL statements or files to be executed after running the scenario.
 * @param {() => Promise<void>} testFunc - The Jest test.
 * @returns {void}
 */
export interface SqlScenarioTest {
  // eslint-disable-next-line @typescript-eslint/prefer-function-type
  (
    testName: string,
    sqlSetup: string | string[],
    sqlTeardown: string | string[],
    testFunc: () => Promise<void>
  ): void;
}

/**
 * Create a Jest test that executes SQL statements before and after executing.
 *
 * @param {string} testName - The name of the test.
 * @param {ContextMap} initialContext - Initial set of key/value pairs to use for replacing "{key}" elements in sql statements.
 * @param {string|string[]} sqlSetup - The SQL statements or files to be executed before running the scenario.
 * @param {string|string[]} sqlTeardown - The SQL statements or files to be executed after running the scenario.
 * @param {() => Promise<void>} testFunc - The Jest test.
 * @returns {void}
 */
export interface SqlScenarioTest {
  // eslint-disable-next-line @typescript-eslint/prefer-function-type
  (
    testName: string,
    initialContext: ContextMap,
    sqlSetup: string | string[],
    sqlTeardown: string | string[],
    testFunc: () => Promise<void>
  ): void;
}

export interface SqlScenarioTest {
  skip: SqlScenarioTest;
  failing: SqlScenarioTest;
  only: SqlScenarioTest;
}


type DescribeBlockWithContextMap = (contextMap?: ContextMap) => void;

/**
 * Create a Jest describe block that executes SQL statements before and after executing all the enclosed tests.
 *
 * @param {string} describeBlockName - The name of the describe block.
 * @param {ContextMap} initialContext - Initial set of key/value pairs to use for replacing "{key}" elements in sql statements.
 * @param {string|string[]} sqlSetup - The SQL statements or files to be executed before running the scenario.
 * @param {string|string[]} sqlTeardown - The SQL statements or files to be executed after running the scenario.
 * @param {DescribeBlockWithContextMap} describeBlock - The describe block containing the scenario tests.
 * @returns {void}
 */
export interface SqlScenarioDescribe {
  // eslint-disable-next-line @typescript-eslint/prefer-function-type
  (
    describeBlockName: string,
    initialContext: ContextMap,
    sqlSetup: string | string[],
    sqlTeardown: string | string[],
    describeBlock: DescribeBlockWithContextMap
  ): void;
}

/**
 * Create a Jest describe block that executes SQL statements before and after executing all the enclosed tests.
 * No custom entries for {key} parameter replacement will be added.
 *
 * @param {string} describeBlockName - The name of the describe block.
 * @param {string|string[]} sqlSetup - The SQL statements or files to be executed before running the scenario.
 * @param {string|string[]} sqlTeardown - The SQL statements or files to be executed after running the scenario.
 * @param {DescribeBlockWithContextMap} describeBlock - The describe block containing the scenario tests.
 * @returns {void}
 */
export interface SqlScenarioDescribe {
  // eslint-disable-next-line @typescript-eslint/prefer-function-type
  (
    describeBlockName: string,
    sqlSetup: string | string[],
    sqlTeardown: string | string[],
    describeBlock: DescribeBlockWithContextMap
  ): void;
}

export interface SqlScenarioDescribe {
  skip: SqlScenarioDescribe;
  only: SqlScenarioDescribe;
}

declare global {
  let sqlScenario: SqlScenarioTest;
  let sqlFileScenario: SqlScenarioTest;

  let describeSqlScenario: SqlScenarioDescribe;
  let describeSqlFileScenario: SqlScenarioDescribe;
}
