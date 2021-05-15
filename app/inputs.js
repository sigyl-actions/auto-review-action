/** @arg {string} input */
function getInput(input){
    return process.env['INPUT_' + input.toUpperCase()]
}

/** @arg {string} variable */
function renameVarToInput(variable){
    let res = '';
    for(const char of variable){
        if(char === char.toUpperCase()) res += '-' + char.toLowerCase();
        else res += char;
    }
    return res;
}

/** @type {{[input: string]: string}} */
const inputs = new Proxy({}, { get: (_, name) => getInput(renameVarToInput(name)) });

module.exports = inputs;
