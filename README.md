api/`jest.config.js` and api/types/`api-sqlscenarios.d.ts` are files I created to grant the ability to execute SQL statements before and after either tests or groups of tests using Jest in [RedwoodJS](https://github.com/redwoodjs/redwood).

I had an issue with needing custom pre/post SQL to handle multiple databases, and got the idea and based the approach on https://github.com/redwoodjs/redwood/pull/9572.
