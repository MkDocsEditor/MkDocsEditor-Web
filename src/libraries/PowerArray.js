'use strict';
var mainContainer, module = module || undefined, isModule = false, isBrowser = true;
if (typeof module !== "undefined") {
    module.exports = {};
    isModule = true;
}

if (typeof window === 'object') {
    mainContainer = window;
} else {
    isBrowser = false;
    mainContainer = global;
}
if (mainContainer.pa && console && console.warn) {
    console.warn('PowerArray => Cannot load, global variable "pa" already exists. Assuming that pa is already loaded => Trusting older instance');
}
mainContainer.PowerArray = mainContainer.pa = function (object) {
    if (object.constructor === Array || object.paIsArray) {
        return new paArray(object);
    } else {
        //console.warn('PowerArray => The passed object is not natively an array. Trying to handle it as an array-like object...')
        if ((mainContainer.ol !== undefined && ol.Collection) && object instanceof ol.Collection) {
            //  console.log('Compatible openlayers object detected (ol.Collection)');
            return paArray(object.getArray());
        }
        if (object.length === undefined) {
            throw new Error('PowerArray => The passed object is not an array, or usable as such.');
        }
        return new paArray(object);
    }
};
pa.mainContainer = mainContainer; //pa.mainContainer is a reference to the top element containing the application (window by browsers, global by Node);

/*functions directly bound to the pa object: */
mainContainer.pa.Range = function (from, to, step) {
    if (!pa.IsNumeric(from)) {
        throw new Error('PowerArray => Range fuction => The parameter "from" must be numeric. Wrong value is "' + from + '"');
    }
    if (!pa.IsNumeric(to)) {
        throw new Error('PowerArray => Range fuction => The parameter "to" must be numeric. Received value is "' + to + '"');
    }
    if (!pa.IsNumeric(step)) {
        throw new Error('PowerArray => Range fuction => The parameter "step" must be numeric. Received value is "' + step + '"');
    }

    from = parseFloat(from);
    to = parseFloat(to);
    step = parseFloat(step);

    var result = [], i, l, currVal = from;
    while (currVal < to) {
        result.push(currVal);
        currVal += step;
    }
    result.push(to);
    return result;
};
mainContainer.pa.config = {
    defaults: {
        defaultPromiseTimeout: 10000
    }
};
mainContainer.pa.utils = {}
mainContainer.pa.utils = {
    DataTypes: {
        String: 'String',
        Number: 'Number',
        Date: 'Date',
        Boolean: 'Boolean',
        Object: 'Object',
        ArrayOfObjects: 'ArrayOfObjects',
        ArrayOfPrimitives: 'ArrayOfPrimitives',
        RegExp: 'RegExp',
        Function: 'Function',
        Null: 'Null',
        Undefined: 'Undefined'
    },
    IsStringDate: function (str) {
        return (str.length === 20 && str.substr(19, 1) === 'Z' && str.substr(10, 1) === 'T');
    },
    IsArrayOfObjects: function (val) {
        var l;
        if (!val.paIsArray || val.length === undefined) {
            return false;
        }
        l = val.length;
        while (l--) {
            //TODO: this could fail in collections having objects but one undefined
            if (pa.utils.GetTypeOf(val[l]) !== pa.utils.DataTypes.Object) {
                return false;
            }
        }
        return true;
    },
    /**
     * Parses a string to boolean value. This function searches strictly for the strings "true", "True", "trUE", "falsE", etc.
     * @param str the string to be evaluated
     * @param throwIfNotMatch Boolean, if true, an exception will be raised if the string does not match. If false, null will be returned
     * @returns {*} boolean value if string matches, null if not
     */
    parseBoolean: function (str, throwIfNotMatch) {
        if (!pa.utils.isNullEmptyOrUndefined(str)) {
            var strU = str.toUpperCase();
            if (strU === "TRUE") {
                return true;
            }
            if (strU === "FALSE") {
                return false;
            }
        }

        if (throwIfNotMatch) {
            throw new Error("The string passed to function parseBoolean (" + str + ") doesn't match with any valid string");
        }

        return null;
    }, /**
     * evaluate if something is empty. Deppending on the passed object what it exactly search for:
     *      Numbers and Strings are evaluated against "", undefined and Null
     *      Objects having at least one own property returns false (also if the property is empty!)
     *      Arrays returns false if his length is > 0
     *
     * @param what the element to evaluate
     * @returns {boolean}
     */
    isNullEmptyOrUndefined: function (what) {
        // null has to be evaluated before checking typeof

        if (what === null || what === undefined) {
            return true;
        }
        var t = typeof what;
        if (t === "boolean") {
            return false;
        }

        //Array        
        if (what.paIsArray && what.length > 0)
            return false;

        //Object
        if (t === 'object') {
            var count = 0;
            for (var p in what) {
                if (what.hasOwnProperty(p))
                    return false;
            }
            return true;
        }

        if (t !== "number" && t !== "string" && t !== "undefined") {
            throw new Error("PowerArray => The function IsNullOrEmpty is designed to evaluate strings and numbers, but something different was provided (" + t + ")");
        }

        if (t === "number" && what === 0) {
            return false;
        }

        if (!what) {
            return true;
        }
        return (what + "").length === 0;
    },
    /**
     * Copy properties from a source object to a destination object
     * @param {Object} source source object
     * @param {Object} dest destination object
     * @param {Array<String>} propsList list of properties to copy. if falsy is passed, all properties will be copied.
     * @param {boolean} excludeEmptyProps avoid the copy of empty props to the target
     * @param {boolean} ignoreEmptyProps 
     * @returns {} 
     */
    CopyObjectProps: function (source, dest, propsList, excludeEmptyProps, nullOrUndefinedAsEmptyString) {
        if (!propsList) {
            for (var prop in source) {
                if (source.hasOwnProperty(prop)) {
                    if (nullOrUndefinedAsEmptyString) {
                        var sourceProp = source[prop]
                        dest[prop] = (pa.utils.isNullEmptyOrUndefined(sourceProp)) ? '' : sourceProp;
                    } else {
                        if (excludeEmptyProps && pa.utils.isNullEmptyOrUndefined(source[prop])) {
                            continue;
                        }
                        dest[prop] = source[prop];
                    }
                }
            }

        } else {

            propsList.RunEach(function (prop) {
                if (nullOrUndefinedAsEmptyString) {
                    var sourceProp = source[prop]
                    dest[prop] = (pa.utils.isNullEmptyOrUndefined(sourceProp)) ? '' : sourceProp;
                } else {
                    if (excludeEmptyProps && pa.utils.isNullEmptyOrUndefined(source[prop])) {
                        return;
                    }
                    dest[prop] = source[prop];
                }
            });
        }
    },
    GetTypeOf: function (element, analyzeData) {

        if (element === null) {
            return pa.utils.DataTypes.Null;
        }

        if (element === undefined) {
            return pa.utils.DataTypes.Undefined;
        }
        var to = typeof element;
        switch (to) {
            case 'string':
                return pa.utils.DataTypes.String;
            case 'function':
                return pa.utils.DataTypes.Function;
            case 'number':
                return pa.utils.DataTypes.Number;
            case 'boolean':
                return pa.utils.DataTypes.Boolean;
            case 'object':
                //check hidden types
                if (element instanceof String) {
                    return pa.utils.DataTypes.String;
                }

                if (element instanceof Date) {
                    return pa.utils.DataTypes.Date;
                }

                if (element instanceof Number) {
                    return pa.utils.DataTypes.Number;
                }

                if (element instanceof RegExp) {
                    return pa.utils.DataTypes.RegExp;
                }
                if (element.paIsArray) {
                    // If its an array of objects, it has to be handled different,
                    if (analyzeData && pa.utils.IsArrayOfObjects(element)) {
                        return pa.utils.DataTypes.ArrayOfObjects;
                    } else {
                        return pa.utils.DataTypes.ArrayOfPrimitives;
                    }
                }
                return pa.utils.DataTypes.Object;
            default:
                //any others
                throw new Error("PowerArray Error : Unknown Datatype!");
        }
    },
    ArgumentsToArray: function (args, from, to) {
        var i = from | 0, l = to || args.length, result = [];
        for (; i < l; i++) {
            result.push(args[i]);
        }
        return result;
    },
    GenerateUid: function (prefix, sufix) {
        function getRandom4Chars() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return ((prefix !== undefined) ? prefix + '-' : '') +
            getRandom4Chars() + '-' +
            getRandom4Chars() + '-' +
            getRandom4Chars() +
            getRandom4Chars() + ((sufix !== undefined) ? '-' + sufix : '');
    },
    PropsToArray: function (obj, valueProcessor) {
        var result = [];
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                result.push({ property: prop, value: (valueProcessor) ? valueProcessor(obj[prop]) : obj[prop] });
            }
        }
        return result;
    }
};

mainContainer.pa.paEachParalellsHelper = {
    CheckParalellTaskStates: function (paralellId) {
        var paralell = mainContainer.pa.paEachParalellsHelper.currentParalellIds[paralellId];
        return paralell.CompletedTasks === paralell.TotalProcesses;
    },
    currentParalellIds: {},
    actionKeys: {
        Runeach: 'RunEach',
        TaskState: 'TaskState'
    },
    eventKeys: {
        RuneachDone: 'RuneachDone',
        TaskState: 'TaskStateResponse'
    }
};
mainContainer.pa.paWhereHelper = {
    FillConditions: function (item, conditions) {
        var l = conditions.length, condition, result, subArray;
        while (l--) {
            condition = conditions[l];
            //conditions can be functions or single values, if there are single values, they have to ve evaluated by
            //===. if they are functions everything should continue as by default
            if (typeof condition.condition !== 'function') {
                //if the condition is an object, it's necessary to handle it different.
                //If that's the case we start internally another Where() call, but we know that we are
                //evaluating pro Where call just ONE item and it could be very expensive. TODO: optimize this somehow!
                if (mainContainer.pa.utils.GetTypeOf(condition.condition) === mainContainer.pa.utils.DataTypes.Object) {
                    var itemType = mainContainer.pa.utils.GetTypeOf(item[condition.column], true);

                    switch (itemType) {
                        case mainContainer.pa.utils.DataTypes.ArrayOfObjects:
                        case mainContainer.pa.utils.DataTypes.ArrayOfPrimitives:

                            result = item[condition.column].Where.call(item[condition.column], condition.condition, false, true);
                            //when sending true als "justFirst", Where() will return the first found element, not an array,
                            //because i'm sending true for performance reasons, it's necessary to evaluate the result with undefined
                            //instead of: "return result.length > 0;" it's now "return result !== undefined;"
                            if (result !== undefined) {
                                continue;
                            } else {
                                return false;
                            }
                        case mainContainer.pa.utils.DataTypes.Object:
                            subArray = pa([item[condition.column]]);
                            result = subArray.Where.call(subArray, condition.condition, false, true);
                            if (result !== undefined) {//See previous comment about justFirst param
                                continue;
                            } else {
                                return false;
                            }
                    }
                }
                condition.condition = pa.EqualTo3(condition.condition); //transforms an explicit value into an === evaluation
            }

            if (!item || !condition.condition(item[condition.column])) { //if one condition is not fulfilled, just return false;
                return false;
            }
        }
        return true;
    },
    ProcessConditionObject: function (whereConditions, keepOrder, isArrayOfConditions, justFirst, justIndexes) {
        //to call this function, "this" should be an array!
        var fc = mainContainer.pa.paWhereHelper.FillConditions,
            i, w, item, lw, assert, l, result = [];

        if (!isArrayOfConditions) {
            //whereConditions is not an array, but i need it in that form
            whereConditions = [whereConditions];
        }

        //Where conditions must be processed in order
        for (i = 0, l = whereConditions.length; i < l; i++) {
            var whereConditionObject = whereConditions[i], realConditions = [];
            if (typeof whereConditionObject === 'function') {
                realConditions.push({
                    column: property,
                    condition: whereConditionObject
                });
            } else {
                for (var property in whereConditionObject) {
                    if (property !== 'realConditions' && whereConditionObject.hasOwnProperty(property)) {
                        //transform the keys into a better object with properties Column and Condition

                        //if whereConditionObject[property] is an array, that means that its a multi filter for a single column, for example: array.Where({age : [GreatherThan(33), BiggerThan(21)], otherField : '33'   });
                        if (whereConditionObject[property] && whereConditionObject[property].paIsArray) {
                            /** MULTIPLE CONDITIONS FOR A SINGLE PROPERTY. Pushed on the realconditions as an AND **/
                            whereConditionObject[property].RunEach(function (subCondition) {
                                realConditions.push({
                                    column: property,
                                    condition: subCondition
                                });
                            });
                        } else {
                            realConditions.push({
                                column: property,
                                condition: whereConditionObject[property]
                            });
                        }
                    }
                }
            }

            whereConditionObject.realConditions = realConditions; //attach the result of this loop direct to the whereConditionObject
        }
        //Real conditions stored
        l = this.length;
        if (keepOrder) { //Anti DRY pattern ;( but as long as it still being small will continue this way to improve performance
            for (i = 0; i < l; i++) {
                item = this[i];
                for (w = 0, lw = whereConditions.length; w < lw; w++) {
                    assert = fc(item, whereConditions[w].realConditions);
                    if (assert) {
                        break;
                    }
                }
                if (assert) {
                    if (justFirst) {
                        return (justIndexes) ? i : item;
                    }
                    result.push((justIndexes) ? i : item);
                }
            }
        } else {
            while (l--) {
                item = this[l];
                for (w = 0, lw = whereConditions.length; w < lw; w++) {
                    assert = fc(item, whereConditions[w].realConditions);
                    if (assert) {
                        if (justFirst) {
                            return (justIndexes) ? l : item;
                        }
                        result.push((justIndexes) ? l : item);
                        break;
                    }
                }
            }
        }

        if (justFirst) {
            //Because in the loops, any positive evaluation makes a return.
            //At this point there was no matches.
            return undefined;
        }

        return result;
    },
    // The following function is a copy of the of the value_equals utiliy of
    // the toubkal project.
    // https://github.com/detky/toubkal/blob/master/lib/util/value_equals.js
    equals: function (a, b, enforce_properties_order, cyclic) {
        /* -----------------------------------------------------------------------------------------
         equals( a, b [, enforce_properties_order, cyclic] )

         Returns true if a and b are deeply equal, false otherwise.

         Parameters:
         - a (Any type): value to compare to b
         - b (Any type): value compared to a

         Optional Parameters:
         - enforce_properties_order (Boolean): true to check if Object properties are provided
         in the same order between a and b

         - cyclic (Boolean): true to check for cycles in cyclic objects

         Implementation:
         'a' is considered equal to 'b' if all scalar values in a and b are strictly equal as
         compared with operator '===' except for these two special cases:
         - 0 === -0 but are not equal.
         - NaN is not === to itself but is equal.

         RegExp objects are considered equal if they have the same lastIndex, i.e. both regular
         expressions have matched the same number of times.

         Functions must be identical, so that they have the same closure context.

         "undefined" is a valid value, including in Objects

         106 automated tests.

         Provide options for slower, less-common use cases:

         - Unless enforce_properties_order is true, if 'a' and 'b' are non-Array Objects, the
         order of occurence of their attributes is considered irrelevant:
         { a: 1, b: 2 } is considered equal to { b: 2, a: 1 }

         - Unless cyclic is true, Cyclic objects will throw:
         RangeError: Maximum call stack size exceeded
         */
        return a === b       /* strick equality should be enough unless zero*/ // jshint ignore:line
            && a !== 0         /* because 0 === -0, requires test by _equals()*/   // jshint ignore:line
            || _equals(a, b) /* handles not strictly equal or zero values*/   // jshint ignore:line
            ;
        function _equals(a, b) {
            // a and b have already failed test for strict equality or are zero

            var s, l, p, x, y;

            // They should have the same toString() signature
            if ((s = toString.call(a)) !== toString.call(b)) return false; // jshint ignore:line

            switch (s) {
                default: // Boolean, Date, String
                    return a.valueOf() === b.valueOf();

                case '[object Number]':
                    // Converts Number instances into primitive values
                    // This is required also for NaN test bellow
                    a = +a;
                    b = +b;

                    return a ?         // a is Non-zero and Non-NaN
                        a === b
                        :                // a is 0, -0 or NaN
                        a === a ?      // a is 0 or -O
                            1 / a === 1 / b    // 1/0 !== 1/-0 because Infinity !== -Infinity
                            : b !== b        // NaN, the only Number not equal to itself!
                        ;
                // [object Number]

                case '[object RegExp]':
                    return a.source == b.source // jshint ignore:line
                        && a.global == b.global // jshint ignore:line
                        && a.ignoreCase == b.ignoreCase // jshint ignore:line
                        && a.multiline == b.multiline // jshint ignore:line
                        && a.lastIndex == b.lastIndex // jshint ignore:line
                        ;
                // [object RegExp]

                case '[object Function]':
                    return false; // functions should be strictly equal because of closure context
                // [object Function]

                case '[object Array]':
                    // intentionally duplicated bellow for [object Object]
                    if (cyclic && (x = reference_equals(a, b)) !== null) return x;  // jshint ignore:line

                    if ((l = a.length) != b.length) return false; // jshint ignore:line
                    // Both have as many elements

                    while (l--) {
                        if ((x = a[l]) === (y = b[l]) && x !== 0 || _equals(x, y)) continue; // jshint ignore:line

                        return false;
                    }

                    return true;
                // [object Array]

                case '[object Object]':
                    // intentionally duplicated from above for [object Array]
                    if (cyclic && (x = reference_equals(a, b)) !== null) return x; // jshint ignore:line

                    l = 0; // counter of own properties

                    if (enforce_properties_order) {
                        var properties = [];

                        for (p in a) {
                            if (a.hasOwnProperty(p)) {
                                properties.push(p);

                                if ((x = a[p]) === (y = b[p]) && x !== 0 || _equals(x, y)) continue; // jshint ignore:line

                                return false;
                            }
                        }

                        // Check if 'b' has as the same properties as 'a' in the same order
                        for (p in b)
                            if (b.hasOwnProperty(p) && properties[l++] != p) // jshint ignore:line
                                return false; // jshint ignore:line
                    } else {
                        for (p in a) {
                            if (a.hasOwnProperty(p)) {
                                ++l;

                                if ((x = a[p]) === (y = b[p]) && x !== 0 || _equals(x, y)) continue; // jshint ignore:line

                                return false;
                            }
                        }

                        // Check if 'b' has as not more own properties than 'a'
                        for (p in b)
                            if (b.hasOwnProperty(p) && --l < 0) // jshint ignore:line
                                return false; // jshint ignore:line
                    }

                    return true;
                // [object Object]
            } // switch toString.call( a )
        } // _equals()

        /* -----------------------------------------------------------------------------------------
         reference_equals( a, b )

         Helper function to compare object references on cyclic objects or arrays.

         Returns:
         - null if a or b is not part of a cycle, adding them to object_references array
         - true: same cycle found for a and b
         - false: different cycle found for a and b

         On the first call of a specific invocation of equal(), replaces self with inner function
         holding object_references array object in closure context.

         This allows to create a context only if and when an invocation of equal() compares
         objects or arrays.
         */
        function reference_equals(a, b) {
            var object_references = [];

            return (reference_equals = _reference_equals)(a, b); // jshint ignore:line

            function _reference_equals(a, b) {
                var l = object_references.length;

                while (l--)
                    if (object_references[l--] === b) // jshint ignore:line
                        return object_references[l] === a; // jshint ignore:line

                object_references.push(a, b);

                return null;
            } // _reference_equals()
        } // reference_equals()
    } // equals()
};


mainContainer.pa.auxiliaryFunctions = {
    Contains: function (value, enforcePropsOrder, cyclic) {
        return function (val) {
            if (!val.paIsArray) {
                throw new Error("PowerArray error => parameter val passed to Contains function should be an array.");
            }
            var l = val.length, isIndexable = false;
            var typeToEvaluate = typeof value;

            switch (typeToEvaluate) {
                case "number":
                case "string":
                case "boolean":
                    isIndexable = true;
                    break;
                default: //anything else
                    //duck type to exclude dates
                    if (typeof value.getMonth === 'function') {
                        isIndexable = true;
                        break;
                    }
                    isIndexable = false;
                    break;
            }
            if (isIndexable) {
                return val.indexOf(value) > -1;
            }

            while (l--) {
                if (pa.paWhereHelper.equals(val[l], value, enforcePropsOrder, cyclic)) {
                    return true;
                }
            }
            return false;

        };
    },
    Between: function (from, to, excludeExactMatches) {
        if (to < from) {
            console.warn("PowerArray warn => Parameters 'from' and 'to' passed to function Between() makes no sense: Parameter 'to' (" + to + ") should be greater than from (" + from + ")");
        }
        if (!excludeExactMatches) {
            return function (val) {
                return val >= from && val <= to;
            };
        } else {
            return function (val) {
                return val > from && val < to;
            };
        }
    },
    EndsWith: function (value) {
        var value2 = value + '';
        return function (endsWithString) {

            endsWithString = endsWithString + '';
            return endsWithString.substr(endsWithString.length - (value2).length) === value2;
        };
    },
    StartsWith: function (value) {
        var value2 = value + '';
        return function (val) {
            val = val + '';
            return val.indexOf(value2) === 0;
        };
    },
    GreaterOrEqualThan: function (value) {
        return function (val) {
            return val >= value;
        };
    },
    GreaterThan: function (value) {
        return function (val) {
            return val > value;
        };
    },
    SmallerOrEqualThan: function (value) {
        return function (val) {
            return val <= value;
        };
    },
    SmallerThan: function (value) {
        return function (val) {
            return val < value;
        };
    },
    EqualTo3: function (value) {
        return function (val) {
            return val === value;
        };
    },
    NotEqualTo3: function (value) {
        return function (val) {
            return val !== value;
        };
    },
    EqualTo2: function (value) {
        return function (val) {
            // ReSharper disable once CoercedEqualsUsing
            return val == value; // jshint ignore:line
        };
    },
    NotEqualTo2: function (value) {
        return function (val) {
            // ReSharper disable once CoercedEqualsUsing
            return val != value; // jshint ignore:line
        };
    },
    IsUndefined: function () {
        return function (val) {
            return val === undefined;
        };
    },
    IsDefined: function () {
        return function (val) {
            return val !== undefined;
        };
    },
    In: function (list) {
        //TODO: investigar si esta function pierde performance al no estar devolviendo una
        //funcion como todo el resto.

        if (arguments.length > 1) {
            list = Array.prototype.slice.call(arguments);
        }
        //TODO: Esto es muy propenso a errores, evaluar mejor los parametros [{},etc]
        return function (val) {
            return list.indexOf(val) !== -1; // jshint ignore:line
        };
    },
    NotIn: function (list) {
        if (arguments.length > 1) {
            list = Array.prototype.slice.call(arguments);
        }
        return function (val) {
            return list.indexOf(val) === -1; // jshint ignore:line
        };
    },
    EqualTo: function (object, func, enforcePropsOrder, cyclic) {
        return function (val) {
            if (func) {
                return func(val, object);
            } else {
                return pa.paWhereHelper.equals(object, val, enforcePropsOrder, cyclic);
            }
        };
    },
    Like: function (value) {
        if (!value.paIsArray) {
            value = Array.prototype.slice.call(arguments);
        }
        return function (val) {
            var l = value.length;
            while (l--) {
                if (val.indexOf(value[l]) === -1) {
                    return false;
                }
            }
            return true;
        };
    },
    NotLike: function (value) {
        if (!value.paIsArray) {
            value = Array.prototype.slice.call(arguments);
        }
        return function (val) {
            var l = value.length;
            while (l--) {
                if (val.indexOf(value[l]) > -1) {
                    return false;
                }
            }
            return true;
        };
    },
    LikeIgnoreCase: function (value) {
        if(value === undefined) 
            throw new Error("PowerArray Error => undefined was passed to LikeIgnoreCase");

        var valueCaseInsensitive = '';
        if (!value.paIsArray) {
            value = Array.prototype.slice.call(arguments);
        }
        return function (val) {
            if (val === null || val === undefined)
                return false;
            var l = value.length;
            while (l--) {
                valueCaseInsensitive = value[l].toUpperCase();
                if (val.toUpperCase().indexOf(valueCaseInsensitive) === -1) {
                    return false;
                }
            }
            return true;
        };
    },
    NotLikeIgnoreCase: function (value) {
        var valueCaseInsensitive = '';
        if (!value.paIsArray) {
            value = Array.prototype.slice.call(arguments);
        }
        return function (val) {
            var l = value.length;
            while (l--) {
                valueCaseInsensitive = value[l].toUpperCase();
                if (val.toUpperCase().indexOf(valueCaseInsensitive) > -1) {
                    return false;
                }
            }
            return true;
        };
    },
    IsTruthy: function () {
        return function (val) {
            return (val) ? true : false;
        };
    },
    IsFalsy: function () {
        return function (val) {
            return (val) ? false : true;
        }
    },
    IsTrue: function () {
        return function (val) {
            return val === true;
        };
    },
    IsFalse: function () {
        return function (val) {
            return val === false;
        }
    },
    IsEmpty: function () {
        return function (val) {
            return val === undefined || val === '' || val === null || val === 0 || (val.paIsArray && val.length === 0);
        }
    },
    IsNotEmpty: function () {
        return function (val) {
            if (val === undefined || val === null) {
                return false;
            }
            return (val + "").length > 0;
        }
    },
    IsNull: function () {
        return function (val) {
            return val === null;
        }
    },
    IsNotNull: function () {
        return function (val) {
            return val !== null;
        }
    },
    IsNaN: function () {
        return function (val) {
            return isNaN(val);
        }
    },
    IsNotNaN: function () {
        return function (val) {
            return !isNaN(val);
        }
    },
    IsNumeric: function (num) {
        return !isNaN(parseFloat(num)) && isFinite(num);
    },
    IsInteger: function (num) {
        return num === parseInt(num, 10);
    }

};

mainContainer.pa.prototypedFunctions_Array = {
    getIndexByProperty: function (valueToSearchFor) {// jshint ignore:line
        /**
         * This function, evaluates properties (or function results) over each object on an array, and answers with an
         * array of the found elements that matches the specified condition. The condition is given by the parameters
         * provided after position 2. The only fixed parameters are the objects array and the value to search for.
         * You can provide so many parameters as you want. Each parameter means one level deeper to search for. For example:
         *
         *      let's say that you have a collection of "car" objects, having each car a function called "getPassengers"
         *      which answers with a collection of "people" objects, and each people have a property called "name".
         *
         *  To get an array of cars having a passenger called Paul, use as following:
         *
         *  var namedPaul = findDistinctValuesOnObjectCollectionByProperty(theCarsCollection, 'Paul', 'getPassengers()','name');
         *
         * @param objectsArray
         * @param valueToSearchFor
         * @returns {number}
         */
        var objectsArray = this;
        //if (!objectsArray) {
        //    return -1;
        //}
        var ia, la = arguments.length; // ia = i for arguments; la = length for arguments
        var io, lo = objectsArray.length; // io = i for objects; lo = length for objects

        for (io = 0; io < lo; io++) { //iterate objects array
            var tmpObj = objectsArray[io];

            for (ia = 1; ia < la; ia++) { //iterate throw arguments to get the right property. Start from 1, to exclude the objectsArray self
                var arg = arguments[ia];
                var isFunc = arg.substring(arg.length - 2) === "()";
                var argName = (isFunc) ? arg.substr(0, arg.length - 2) : arg;
                tmpObj = (isFunc) ? tmpObj[argName]() : tmpObj[arg];
                // Converting comparison needed (e.g. string id vs integer id)
                // ReSharper disable once CoercedEqualsUsing
                if (ia + 1 === la && tmpObj == valueToSearchFor) { // jshint ignore:line
                    return io;
                }
            }
        }
        return -1;
    },
    GetPropertyFlat: function (property, keepOrder, includeDuplicates, includeUndefineds) { // jshint ignore:line
        var array = this;
        var result = [], t = array.length;
        if (keepOrder === true) {
            for (var i = 0; i < t; i++) {
                if (includeDuplicates || result.indexOf(array[i][property]) === -1) {
                    if (includeUndefineds === true || array[i][property] !== undefined) {
                        result.push(array[i][property]);
                    }
                }
            }
        } else {
            while (t--) {
                if (includeDuplicates || result.indexOf(array[t][property]) === -1) {
                    if (includeUndefineds === true || array[t][property] !== undefined) {
                        result.push(array[t][property]);
                    }
                }
            }
        }
        return result;
    },
    GetByProperty: function (valueToSearchFor) {// jshint ignore:line
        /**
         * This function, evaluates properties (or function results) over each object on an array, and answers with an
         * array of the found elements that matches the specified condition. The condition is given by the parameters
         * provided after position 2. The only fixed parameters are the objects array and the value to search for.
         * You can provide so many parameters as you want. Each parameter means one level deeper to search for. For example:
         *
         *      let's say that you have a collection of "car" objects, having each car a function called "getPassengers"
         *      which answers with a collection of "people" objects, and each people have a property called "name".
         *
         *  To get an array of cars having a passenger called Paul, use as following:
         *
         *  var passengersNamedPaul = carsArray.getByProperty('Paul', 'getPassengers()','name');
         *
         * @param objectsArray
         * @param valueToSearchFor
         * @returns {Array}
         */
        var objectsArray = this;
        var results = [];
        var ia, la = arguments.length; // ia = i for arguments; la = length for arguments
        var io, lo = objectsArray.length; // io = i for objects; lo = length for objects
        for (io = 0; io < lo; io++) { //iterate objects array
            var tmpObj = objectsArray[io];

            for (ia = 1; ia < la; ia++) { //iterate throw arguments to get the right property. Start from 1, to exclude the objectsArray self
                var arg = arguments[ia];
                var isFunc = arg.substring(arg.length - 2) === "()";
                var argName = (isFunc) ? arg.substr(0, arg.length - 2) : arg;
                tmpObj = (isFunc) ? tmpObj[argName]() : tmpObj[arg];
                if (ia + 1 === la && tmpObj === valueToSearchFor) {
                    results.push(objectsArray[io]);
                }
            }
        }
        return results;
    },
    /**
     * Executes a function (task) on each element of the array (this).
     * @param {} task       A function to execute. It will receive 3 parameters:
     *                          1) one array item
     *                          2) index of the passed item (param 1) on the original array.
     *                          3) the complete array. Warning, you should not change it. See it as read-only!
     *
     * @param {} callback   A callback function to be executed after processing all array items.
     *                      It will get as first parameter the results-array (that lately will be
     *                      returned as result of this function).
     *                       *****************************PLEASE READ**********************************
     *                      *** If the callback function returns something different than undefined, ***
     *                      ***      the results-array will be replaced with that return value       ***
     *                       **************************************************************************
     * @param {} keepOrder
     * @returns             array of the result of each executed task (keeping same position as on original
     *                      array, regardless order). Excepion: when the execution of the callback function
     *                      returns something different than undefined, that will be returned instead of the
     *                      . If not,
     */
    RunEach: function (task, callback, keepOrder, progress) {// jshint ignore:line
        var l = this.length, i = 0, result = new Array(this.length), tmp;
        if (!keepOrder) {
            while (l--) {
                result[l] = task(this[l], l, this);
            }
        } else {
            for (; i < l; i++) {
                result[i] = task(this[i], i, this);
            }
        }
        if (callback) {
            //if the callback function returns something,
            //the result will be overrided with that result.
            result = callback(result) || result;
        }
        return result;
    },
    Sort: function (sortConditions) { // jshint ignore:line
        var realConditions = [];
        var conditionType = typeof sortConditions;

        switch (conditionType) {
            case "string":
                //This call, with a first parameter of type string, should be "ASC" or "DESC"
                var condition = sortConditions.toUpperCase();
                switch (condition) {
                    case pa.Sort.Ascending:
                    case pa.Sort.Asc:
                        return this.sort(function (a, b) {
                            if (a < b) {
                                return -1;
                            } else if (a > b) {
                                return 1;
                            }
                            return 0;
                        });
                    case pa.Sort.AscendingIgnoringCase:
                    case pa.Sort.AscIgnoringCase:
                        return this.sort(function (a, b) {
                            try {
                                return a.toLowerCase().localeCompare(b.toLowerCase());
                            } catch (e) {
                                if (console && console.warn) {
                                    console.warn('PowerArray => Error by sorting by ' + condition + ', all values has to be strings. Probably it\'s not the case!. Now casting to string, performance may be affected.');
                                    a = a + '';
                                    b = b + '';
                                    return a.toLowerCase().localeCompare(b.toLowerCase());
                                }
                            }
                        });
                    case pa.Sort.Descending:
                    case pa.Sort.Desc:
                        return this.sort(function (a, b) {
                            if (a > b) {
                                return -1;
                            } else if (a < b) {
                                return 1;
                            }
                            return 0;
                        });
                    case pa.Sort.DescendingIgnoringCase:
                    case pa.Sort.DescIgnoringCase:
                        return this.sort(function (a, b) {
                            return (a.toLowerCase().localeCompare(b.toLowerCase())) * -1;
                        });
                    default:
                        throw new Error("PowerArray Error: Invalid sort condition. If you pass a first parameter of type String to the Sort function," +
                            " PowerArray assumes that you have a simple array on your hand (one dimension of primitives). Possible parameter values for function Sort " +
                            " in that situation, are: 1) To sort Ascending: 'Asc' and 'AscIgnoreCase' (aliases: 'Ascending', 'AscendingIgnoreCase'), and 2)" +
                            " To sort Descending: 'Desc','Descending' (aliases: 'Descending', 'DescendingIgnoreCase') ");
                }
            case "object":

                if (sortConditions instanceof RegExp) {
                    throw new Error("PowerArray Error: Invalid sortConditions object. A RegExp is not allowed as Sort Criterion!");
                }

                if (!sortConditions) {
                    if (sortConditions.hasOwnProperty('length')) {
                        throw new Error("PowerArray Error: Invalid sortConditions object");
                    }
                }

                for (var property in sortConditions) {
                    if (sortConditions.hasOwnProperty(property)) {

                        //transform the keys into a better object with properties Column and SortOrder
                        var value = sortConditions[property].toUpperCase();

                        if (!mainContainer.pa.Sort._validSortConfigStrings.indexOf(sortConditions[property]) === -1) {
                            throw new Error("PowerArray Configuration Error => Invalid sort direction for property " + property + ": '" + sortConditions[property] + "'");
                        }

                        realConditions.push({
                            column: property,
                            sortDirection: value
                        });
                    }
                }

                return this.sort(function (a, b) {

                    var result = 0, currentColumn, cycleValue;

                    for (var i = 0, l = realConditions.length; i < l; i++) {
                        currentColumn = realConditions[i].column;
                        switch (realConditions[i].sortDirection) {
                            case mainContainer.pa.Sort.Ascending:
                            case mainContainer.pa.Sort.Asc:
                            case mainContainer.pa.Sort.AscendingIgnoringCase:
                            case mainContainer.pa.Sort.AscIgnoringCase:
                                if (a[currentColumn] < b[currentColumn]) return  -1;
                                if (a[currentColumn] > b[currentColumn]) return 1;
                            case mainContainer.pa.Sort.Descending:
                            case mainContainer.pa.Sort.Desc:
                            case mainContainer.pa.Sort.DescendingIgnoringCase:
                            case mainContainer.pa.Sort.DescIgnoringCase:
                                if (a[currentColumn] < b[currentColumn]) return 1;
                                if (a[currentColumn] > b[currentColumn]) return -1;
                        }
                    }
                    return 0;

                });
            case "undefined":
                //No parameters passed, sorting by default
                return this.sort();
            case "function":
                return this.sort(sortConditions); //simple forward to array.sort
            default:
                throw new Error("Unknown sortConditions object type (" + conditionType + ")");
        }
    },
    Exists: function (whereConditions) {
        if(typeof(whereConditions) === 'string') {
            //transform single match strings to an EqualTo3
            whereConditions = EqualTo3(whereConditions);
        }
        if (pa.prototypedFunctions_Array.First.call(this, whereConditions)) {
            return true;
        } else {
            return false;
        }
    },
    Remove: function (whereConditions) {
        if(typeof(whereConditions) === 'string') {
            //transform single match strings to an EqualTo3
            whereConditions = EqualTo3(whereConditions);
        }
        var first = this.FirstIndex(whereConditions);
        while (first !== undefined) {
            this.splice(first, 1);
            first = this.FirstIndex(whereConditions);
        }
        return this;
    },
    Distinct: function () {
        var val, l = this.length, results = [], item, cache = [],
            type = pa.utils.GetTypeOf(this, true),
            types = pa.utils.DataTypes;
        if (type !== types.ArrayOfPrimitives && type !== types.ArrayOfObjects) {
            throw new Error("PowerArray => Distinct => Currently, the distinct function works only for arrays of primitive data.");
        }
        if (type !== types.ArrayOfObjects) {
            //it's a primitive
            while (l--) {
                val = this[l];
                if (results.indexOf(val) === -1 && val !== undefined) {
                    results.push(val);
                }
            }
        } else {
            //TODO: this is very slow!
            while (l--) {
                item = this[l];
                val = JSON.stringify(item);
                if (cache.indexOf(val) === -1 && val !== undefined) {
                    cache.push(val);
                    results.push(item);
                }
            }
        }

        return results;
    },
    /** Iterates an array and executes the function on each item as runeach does, but always returns the original array  */
    Iterate: function (func, keepOrder) {
        this.RunEach(func, undefined, keepOrder);
        return this;
    },
    /**returns a collection of the results of the execution of "func" in a given order */
    Collect: function (func, keepOrder) {
        return this.RunEach(func, undefined, keepOrder);
    },
    WhereIndexes: function (whereConditions, keepOrder, justFirst) {
        return this.Where(whereConditions, keepOrder, justFirst, true);
    },
    Where: function (whereConditions, keepOrder, justFirst, justIndexes) {// jshint ignore:line
        var i, l = this.length, item, result = [], tmp;
        justIndexes = (justIndexes) ? true : false; //just to avoid casting when comparing during loop
        if (typeof whereConditions === 'object' && !(whereConditions.paIsArray)) {
            if (!Object.keys(whereConditions).length) // when the conditions-object is empty (no properties), then exit returning the same array
                return this;

            //If It's an object, but not an array, it is a conditions object
            result = pa.paWhereHelper.ProcessConditionObject.call(this, whereConditions, keepOrder, false, justFirst, justIndexes);
        } else {

            //At this point, whereConditions could be a:
            //                                          => function (a custom function),
            //                                          => an pa.EqualTo,
            //                                          => an Array of condition-objects

            if (typeof whereConditions === 'undefined') {
                var a = new Error("PowerArray => Where function => No condition object provided to function 'Where(whereConditions, keepOrder)'");
                a.message = "InvalidWhereCondition";
                throw a;
            } else if (whereConditions.paIsArray) {
                //It's a conditions array
                tmp = pa.paWhereHelper.ProcessConditionObject.call(this, whereConditions, keepOrder, true, justFirst, justIndexes);
                if (justFirst)
                    return tmp;
                result.push.apply(result, tmp);
            } else {
                //whereConditions it's a function. It could be a custom function on the pa standard EqualTo (that works
                //different than any other standard function)
                if (keepOrder) {
                    for (i = 0; i < l; i++) {
                        item = this[i];
                        if (whereConditions(item)) {
                            if (justFirst) {
                                return (justIndexes) ? i : item;
                            }
                            result.push(item);
                        }
                    }
                } else {
                    while (l--) {
                        item = this[l];
                        if (whereConditions(item)) {
                            if (justFirst) {
                                return (justIndexes) ? l : item;
                            }
                            result.push(item);
                        }
                    }
                }
            }
        }
        if (justFirst) {
            if (result!== undefined) { //it is important to check with undefined! (0 is a valid result when justIndexes = true)
                if (result.paIsArray) {
                    if(result.length > 0) 
                        return result[0]
                    return undefined; // there is only one
                }
                return result;
            }
            return undefined;
        }
        return result;
    },
    Count: function (whereConditions) {
        if (arguments.length !== 1) {
            throw new Error('PowerArray => Count function => Invalid arguments. The only argument is a whereCondition or an array of whereConditions object.');
        }
        return pa.prototypedFunctions_Array.Where.call(this, whereConditions, false, false).length;
    },
    First: function (whereConditions) {// jshint ignore:line
        if (arguments.length === 0) {
            return (this.length > 0) ? this[0] : undefined;
        }
        return pa.prototypedFunctions_Array.Where.call(this, whereConditions, true, true);
    },
    FirstIndex: function (whereConditions) {// jshint ignore:line
        if (arguments.length === 0) {
            return (this.length > 0) ? 0 : undefined;
        }
        return pa.prototypedFunctions_Array.Where.call(this, whereConditions, true, true, true);
    },
    Average: function () {
        //TODO: the same way to work as Max()
    },
    /*Return an object containing min and max values of one or more propeties in an objects array */
    Bounds: function () {
        var l = this.length, alc, al = arguments.length, maxVal, result = {}, arrayItemValue, currentArgName = '';
        if (al === 0) {
            throw new Error("PowerArray => bounds => invalid params, please provide one or more target parameters");
        }
        alc = al;
        while (alc--) {
            currentArgName = arguments[alc];
            result[currentArgName] = { min: undefined, max: undefined };
        }
        while (l--) {
            alc = al;
            while (alc--) {
                currentArgName = arguments[alc];
                arrayItemValue = this[l][currentArgName];
                if (result[currentArgName].max === undefined || (arrayItemValue !== undefined && arrayItemValue > result[currentArgName].max)) {
                    result[currentArgName].max = arrayItemValue;
                }
                if (result[currentArgName].min === undefined || (arrayItemValue !== undefined && arrayItemValue < result[currentArgName].min)) {
                    result[currentArgName].min = arrayItemValue;
                }
            }
        }

        return result;

    },
    /**
     * Return max values of specified properties
     * @param {} target
     * @returns {}
     */
    Max: function () {
        var l = this.length, alc, al = arguments.length, maxVal, result = {}, arrayItemValue, currentArgName = '';
        if (al === 0) {
            throw new Error("PowerArray => Max => invalid params, please provide one or more target parameters");
        }
        alc = al;
        while (alc) {
            //evaluate if the passed arguments are integers. this means that the collection has indexable objects (arrays or array like objects)

        }
        while (l--) {
            alc = al;
            while (alc--) {
                currentArgName = arguments[alc];
                arrayItemValue = this[l][currentArgName];
                if (result[currentArgName] === undefined || (arrayItemValue !== undefined && arrayItemValue > result[currentArgName])) {
                    result[currentArgName] = arrayItemValue;
                }
            }
        }

        if (al === 1) { //if only one max is expected, just return it
            return result[currentArgName];
        } else if (al > 1) {

        }
    },
    Take: function (count, skip) {
        skip = skip || 0;
        var i = 0 + skip, l = this.length, result = [], added = 0;
        for (; i < l && added < count; i++) {
            result.push(this[i]);
            added++;
        }
        return result;
    },
    Last: function () {
        var idx = this.length - 1;
        return (idx > -1) ? this[idx] : null;
    }
};

// ReSharper disable once WrongExpressionStatement
mainContainer.pa.Sort = {
    Ascending: 'ASCENDING',
    Asc: 'ASC',
    AscendingIgnoringCase: 'ASCENDINGIGNORINGCASE',
    AscIgnoringCase: 'ASCIGNORINGCASE',
    Descending: 'DESCENDING',
    Desc: 'DESC',
    DescendingIgnoringCase: 'DESCENDINGIGNORINGCASE',
    DescIgnoringCase: 'DESCIGNORINGCASE',
}
var validSortingConf = [
    mainContainer.pa.Sort.Ascending,
    mainContainer.pa.Sort.Asc,
    mainContainer.pa.Sort.AscendingIgnoringCase,
    mainContainer.pa.Sort.AscIgnoringCase,
    mainContainer.pa.Sort.Descending,
    mainContainer.pa.Sort.Desc,
    mainContainer.pa.Sort.DescendingIgnoringCase,
    mainContainer.pa.Sort.DescIgnoringCase];

mainContainer.pa.Sort._validSortConfigStrings = validSortingConf;
mainContainer.Sort = mainContainer.pa.Sort;

var paArray = function (array) {
    if (!array.paIsArray) {
        throw new Error('PowerArray => paArray warning => Invalid array passed to pa() function"');
    }
    var newArray = array.slice(0);

    var functionsToAttach = mainContainer.pa.prototypedFunctions_Array;
    for (var currentFunctionName in functionsToAttach) {
        if (functionsToAttach.hasOwnProperty(currentFunctionName)) {
            newArray[currentFunctionName] = functionsToAttach[currentFunctionName]; // jshint ignore:line
        }
    }
    return newArray;
};

paArray.prototype.isArray = true;

//region "Initialization"
(function () {
    //Register all Pa auxiliary functions to make them accessible through the mainContainer object and mainContainer.pa object
    //If a mainContainer accessor is already taken and cannot be set, warn the user.
    var obj = mainContainer.pa.auxiliaryFunctions;
    for (var p in obj) {
        if (obj.hasOwnProperty(p)) {
            mainContainer.pa[p] = obj[p];
            if (!mainContainer[p]) {
                mainContainer[p] = obj[p];
            } else {
                console.warn('PowerArray warning! => property mainContainer.' + p + ' already exists. PowerArrayFunction pa.' + p + ' cannot register this function on mainContainer scope. However, you can still using it by calling "pa.' + p + '"');
            }
        }
    }

    if (!Array.prototype.paIsArray) {
        //TODO: this cannot stay fix like that ;(
        Array.prototype.paIsArray = true;// jshint ignore:line
    }

    //Register all Array prototype functions to make them accessible to each array.
    //If function name is already is already taken, warn the user and describe alternative usage way.
    var functionsToAttach = mainContainer.pa.prototypedFunctions_Array;
    for (var currentFunctionName in functionsToAttach) {
        if (functionsToAttach.hasOwnProperty(currentFunctionName)) {
            if (Array.prototype.hasOwnProperty(currentFunctionName)) {
                console.warn('PowerArray warning! => Array Prototype was modified by other library, and the function name ' + currentFunctionName +
                    ' is already in use. PowerArray will NOT override the prototype method. However, you can still using the function ' + currentFunctionName +
                    ' by surrounding your array with a pa constructor call, as following: pa(yourArrayName).' + currentFunctionName + "(...)");
            } else {
                //function name is free, go on:
                Array.prototype[currentFunctionName] = functionsToAttach[currentFunctionName]; // jshint ignore:line
            }
            // Attach all functions also to the paArray prototype, that is the wrapper for solve conflicts (pa(array))
            // from array prototype
            paArray.prototype[currentFunctionName] = functionsToAttach[currentFunctionName]; // jshint ignore:line
        }
    }
})();
if (isModule) {
    module.exports = mainContainer.pa;
}
