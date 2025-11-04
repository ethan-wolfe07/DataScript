"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const formatter_1 = require("./formatter");
function activate(context) {
    (0, formatter_1.registerFormatter)(context);
}
function deactivate() {
    // Nothing to clean up currently.
}
//# sourceMappingURL=extension.js.map