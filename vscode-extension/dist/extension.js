"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const formatter_1 = require("./formatter");
const runner_1 = require("./runner");
function activate(context) {
    (0, formatter_1.registerFormatter)(context);
    (0, runner_1.registerRunner)(context);
}
function deactivate() {
    // Nothing to clean up currently.
}
//# sourceMappingURL=extension.js.map