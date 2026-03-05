/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "pages/_app";
exports.ids = ["pages/_app"];
exports.modules = {

/***/ "(pages-dir-node)/./src/pages/_app.js":
/*!***************************!*\
  !*** ./src/pages/_app.js ***!
  \***************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (/* binding */ MyApp)\n/* harmony export */ });\n/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-dev-runtime */ \"react/jsx-dev-runtime\");\n/* harmony import */ var _styles_globals_css__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../styles/globals.css */ \"(pages-dir-node)/./styles/globals.css\");\n/* harmony import */ var _styles_styles_css__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../styles/styles.css */ \"(pages-dir-node)/./styles/styles.css\");\n/* harmony import */ var next_head__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! next/head */ \"(pages-dir-node)/./node_modules/next/head.js\");\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react */ \"react\");\n\n\n\n\n\nconst VIEWPORT_CONTENT = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover';\nfunction MyApp({ Component, pageProps }) {\n    (0,react__WEBPACK_IMPORTED_MODULE_4__.useEffect)({\n        \"MyApp.useEffect\": ()=>{\n            if (true) return;\n            const preventWheelZoom = {\n                \"MyApp.useEffect.preventWheelZoom\": (event)=>{\n                    if ((event.ctrlKey || event.metaKey) && event.cancelable) {\n                        event.preventDefault();\n                    }\n                }\n            }[\"MyApp.useEffect.preventWheelZoom\"];\n            const preventKeyboardZoom = {\n                \"MyApp.useEffect.preventKeyboardZoom\": (event)=>{\n                    if (!event.ctrlKey && !event.metaKey) return;\n                    const key = String(event.key || '').toLowerCase();\n                    const code = String(event.code || '');\n                    const isZoomKey = key === '+' || key === '=' || key === '-' || key === '_' || key === '0' || code === 'NumpadAdd' || code === 'NumpadSubtract' || code === 'Numpad0';\n                    if (isZoomKey && event.cancelable) {\n                        event.preventDefault();\n                    }\n                }\n            }[\"MyApp.useEffect.preventKeyboardZoom\"];\n            const supportsTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)')?.matches;\n            const preventGestureZoom = {\n                \"MyApp.useEffect.preventGestureZoom\": (event)=>{\n                    if (event.cancelable) event.preventDefault();\n                }\n            }[\"MyApp.useEffect.preventGestureZoom\"];\n            const preventPinchZoom = {\n                \"MyApp.useEffect.preventPinchZoom\": (event)=>{\n                    if (!event?.touches) return;\n                    if (event.touches.length > 1 && event.cancelable) {\n                        event.preventDefault();\n                    }\n                }\n            }[\"MyApp.useEffect.preventPinchZoom\"];\n            document.addEventListener('wheel', preventWheelZoom, {\n                passive: false\n            });\n            document.addEventListener('keydown', preventKeyboardZoom, true);\n            if (supportsTouch) {\n                document.addEventListener('gesturestart', preventGestureZoom, {\n                    passive: false\n                });\n                document.addEventListener('gesturechange', preventGestureZoom, {\n                    passive: false\n                });\n                document.addEventListener('gestureend', preventGestureZoom, {\n                    passive: false\n                });\n                document.addEventListener('touchmove', preventPinchZoom, {\n                    passive: false\n                });\n            }\n            return ({\n                \"MyApp.useEffect\": ()=>{\n                    document.removeEventListener('wheel', preventWheelZoom);\n                    document.removeEventListener('keydown', preventKeyboardZoom, true);\n                    if (supportsTouch) {\n                        document.removeEventListener('gesturestart', preventGestureZoom);\n                        document.removeEventListener('gesturechange', preventGestureZoom);\n                        document.removeEventListener('gestureend', preventGestureZoom);\n                        document.removeEventListener('touchmove', preventPinchZoom);\n                    }\n                }\n            })[\"MyApp.useEffect\"];\n        }\n    }[\"MyApp.useEffect\"], []);\n    return /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, {\n        children: [\n            /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(next_head__WEBPACK_IMPORTED_MODULE_3__, {\n                children: [\n                    /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"meta\", {\n                        name: \"viewport\",\n                        content: VIEWPORT_CONTENT\n                    }, void 0, false, {\n                        fileName: \"C:\\\\Reservaeldia\\\\src\\\\pages\\\\_app.js\",\n                        lineNumber: 80,\n                        columnNumber: 9\n                    }, this),\n                    /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"link\", {\n                        rel: \"preconnect\",\n                        href: \"https://accounts.google.com\"\n                    }, void 0, false, {\n                        fileName: \"C:\\\\Reservaeldia\\\\src\\\\pages\\\\_app.js\",\n                        lineNumber: 81,\n                        columnNumber: 9\n                    }, this),\n                    /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"link\", {\n                        rel: \"preconnect\",\n                        href: \"https://www.gstatic.com\",\n                        crossOrigin: \"anonymous\"\n                    }, void 0, false, {\n                        fileName: \"C:\\\\Reservaeldia\\\\src\\\\pages\\\\_app.js\",\n                        lineNumber: 82,\n                        columnNumber: 9\n                    }, this),\n                    /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"link\", {\n                        rel: \"preconnect\",\n                        href: \"https://reservaeldia.com.ar\"\n                    }, void 0, false, {\n                        fileName: \"C:\\\\Reservaeldia\\\\src\\\\pages\\\\_app.js\",\n                        lineNumber: 83,\n                        columnNumber: 9\n                    }, this),\n                    /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"link\", {\n                        rel: \"dns-prefetch\",\n                        href: \"//accounts.google.com\"\n                    }, void 0, false, {\n                        fileName: \"C:\\\\Reservaeldia\\\\src\\\\pages\\\\_app.js\",\n                        lineNumber: 84,\n                        columnNumber: 9\n                    }, this),\n                    /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"link\", {\n                        rel: \"dns-prefetch\",\n                        href: \"//www.gstatic.com\"\n                    }, void 0, false, {\n                        fileName: \"C:\\\\Reservaeldia\\\\src\\\\pages\\\\_app.js\",\n                        lineNumber: 85,\n                        columnNumber: 9\n                    }, this),\n                    /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"link\", {\n                        rel: \"dns-prefetch\",\n                        href: \"//reservaeldia.com.ar\"\n                    }, void 0, false, {\n                        fileName: \"C:\\\\Reservaeldia\\\\src\\\\pages\\\\_app.js\",\n                        lineNumber: 86,\n                        columnNumber: 9\n                    }, this)\n                ]\n            }, void 0, true, {\n                fileName: \"C:\\\\Reservaeldia\\\\src\\\\pages\\\\_app.js\",\n                lineNumber: 79,\n                columnNumber: 7\n            }, this),\n            /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(Component, {\n                ...pageProps\n            }, void 0, false, {\n                fileName: \"C:\\\\Reservaeldia\\\\src\\\\pages\\\\_app.js\",\n                lineNumber: 88,\n                columnNumber: 7\n            }, this)\n        ]\n    }, void 0, true);\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,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REFBQ0g7d0JBQUtDLEtBQUk7d0JBQWFDLE1BQUs7Ozs7OztrQ0FDNUIsOERBQUNGO3dCQUFLQyxLQUFJO3dCQUFlQyxNQUFLOzs7Ozs7a0NBQzlCLDhEQUFDRjt3QkFBS0MsS0FBSTt3QkFBZUMsTUFBSzs7Ozs7O2tDQUM5Qiw4REFBQ0Y7d0JBQUtDLEtBQUk7d0JBQWVDLE1BQUs7Ozs7Ozs7Ozs7OzswQkFFaEMsOERBQUNqQztnQkFBVyxHQUFHQyxTQUFTOzs7Ozs7OztBQUc5QiIsInNvdXJjZXMiOlsiQzpcXFJlc2VydmFlbGRpYVxcc3JjXFxwYWdlc1xcX2FwcC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgJy4uLy4uL3N0eWxlcy9nbG9iYWxzLmNzcyc7XG5pbXBvcnQgJy4uLy4uL3N0eWxlcy9zdHlsZXMuY3NzJztcbmltcG9ydCBIZWFkIGZyb20gJ25leHQvaGVhZCc7XG5pbXBvcnQgeyB1c2VFZmZlY3QgfSBmcm9tICdyZWFjdCc7XG5cbmNvbnN0IFZJRVdQT1JUX0NPTlRFTlQgPSAnd2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEsIG1heGltdW0tc2NhbGU9MSwgbWluaW11bS1zY2FsZT0xLCB1c2VyLXNjYWxhYmxlPW5vLCB2aWV3cG9ydC1maXQ9Y292ZXInO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBNeUFwcCh7IENvbXBvbmVudCwgcGFnZVByb3BzIH0pIHtcbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcgfHwgdHlwZW9mIGRvY3VtZW50ID09PSAndW5kZWZpbmVkJykgcmV0dXJuO1xuXG4gICAgY29uc3QgcHJldmVudFdoZWVsWm9vbSA9IChldmVudCkgPT4ge1xuICAgICAgaWYgKChldmVudC5jdHJsS2V5IHx8IGV2ZW50Lm1ldGFLZXkpICYmIGV2ZW50LmNhbmNlbGFibGUpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3QgcHJldmVudEtleWJvYXJkWm9vbSA9IChldmVudCkgPT4ge1xuICAgICAgaWYgKCFldmVudC5jdHJsS2V5ICYmICFldmVudC5tZXRhS2V5KSByZXR1cm47XG5cbiAgICAgIGNvbnN0IGtleSA9IFN0cmluZyhldmVudC5rZXkgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCBjb2RlID0gU3RyaW5nKGV2ZW50LmNvZGUgfHwgJycpO1xuICAgICAgY29uc3QgaXNab29tS2V5ID1cbiAgICAgICAga2V5ID09PSAnKycgfHxcbiAgICAgICAga2V5ID09PSAnPScgfHxcbiAgICAgICAga2V5ID09PSAnLScgfHxcbiAgICAgICAga2V5ID09PSAnXycgfHxcbiAgICAgICAga2V5ID09PSAnMCcgfHxcbiAgICAgICAgY29kZSA9PT0gJ051bXBhZEFkZCcgfHxcbiAgICAgICAgY29kZSA9PT0gJ051bXBhZFN1YnRyYWN0JyB8fFxuICAgICAgICBjb2RlID09PSAnTnVtcGFkMCc7XG5cbiAgICAgIGlmIChpc1pvb21LZXkgJiYgZXZlbnQuY2FuY2VsYWJsZSkge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBjb25zdCBzdXBwb3J0c1RvdWNoID1cbiAgICAgICgnb250b3VjaHN0YXJ0JyBpbiB3aW5kb3cpIHx8XG4gICAgICAobmF2aWdhdG9yLm1heFRvdWNoUG9pbnRzID4gMCkgfHxcbiAgICAgIHdpbmRvdy5tYXRjaE1lZGlhPy4oJyhwb2ludGVyOiBjb2Fyc2UpJyk/Lm1hdGNoZXM7XG5cbiAgICBjb25zdCBwcmV2ZW50R2VzdHVyZVpvb20gPSAoZXZlbnQpID0+IHtcbiAgICAgIGlmIChldmVudC5jYW5jZWxhYmxlKSBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH07XG5cbiAgICBjb25zdCBwcmV2ZW50UGluY2hab29tID0gKGV2ZW50KSA9PiB7XG4gICAgICBpZiAoIWV2ZW50Py50b3VjaGVzKSByZXR1cm47XG4gICAgICBpZiAoZXZlbnQudG91Y2hlcy5sZW5ndGggPiAxICYmIGV2ZW50LmNhbmNlbGFibGUpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2hlZWwnLCBwcmV2ZW50V2hlZWxab29tLCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBwcmV2ZW50S2V5Ym9hcmRab29tLCB0cnVlKTtcblxuICAgIGlmIChzdXBwb3J0c1RvdWNoKSB7XG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdnZXN0dXJlc3RhcnQnLCBwcmV2ZW50R2VzdHVyZVpvb20sIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdnZXN0dXJlY2hhbmdlJywgcHJldmVudEdlc3R1cmVab29tLCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZ2VzdHVyZWVuZCcsIHByZXZlbnRHZXN0dXJlWm9vbSwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIHByZXZlbnRQaW5jaFpvb20sIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3doZWVsJywgcHJldmVudFdoZWVsWm9vbSk7XG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgcHJldmVudEtleWJvYXJkWm9vbSwgdHJ1ZSk7XG5cbiAgICAgIGlmIChzdXBwb3J0c1RvdWNoKSB7XG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2dlc3R1cmVzdGFydCcsIHByZXZlbnRHZXN0dXJlWm9vbSk7XG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2dlc3R1cmVjaGFuZ2UnLCBwcmV2ZW50R2VzdHVyZVpvb20pO1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdnZXN0dXJlZW5kJywgcHJldmVudEdlc3R1cmVab29tKTtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgcHJldmVudFBpbmNoWm9vbSk7XG4gICAgICB9XG4gICAgfTtcbiAgfSwgW10pO1xuXG4gIHJldHVybiAoXG4gICAgPD5cbiAgICAgIDxIZWFkPlxuICAgICAgICA8bWV0YSBuYW1lPVwidmlld3BvcnRcIiBjb250ZW50PXtWSUVXUE9SVF9DT05URU5UfSAvPlxuICAgICAgICA8bGluayByZWw9XCJwcmVjb25uZWN0XCIgaHJlZj1cImh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbVwiIC8+XG4gICAgICAgIDxsaW5rIHJlbD1cInByZWNvbm5lY3RcIiBocmVmPVwiaHR0cHM6Ly93d3cuZ3N0YXRpYy5jb21cIiBjcm9zc09yaWdpbj1cImFub255bW91c1wiIC8+XG4gICAgICAgIDxsaW5rIHJlbD1cInByZWNvbm5lY3RcIiBocmVmPVwiaHR0cHM6Ly9yZXNlcnZhZWxkaWEuY29tLmFyXCIgLz5cbiAgICAgICAgPGxpbmsgcmVsPVwiZG5zLXByZWZldGNoXCIgaHJlZj1cIi8vYWNjb3VudHMuZ29vZ2xlLmNvbVwiIC8+XG4gICAgICAgIDxsaW5rIHJlbD1cImRucy1wcmVmZXRjaFwiIGhyZWY9XCIvL3d3dy5nc3RhdGljLmNvbVwiIC8+XG4gICAgICAgIDxsaW5rIHJlbD1cImRucy1wcmVmZXRjaFwiIGhyZWY9XCIvL3Jlc2VydmFlbGRpYS5jb20uYXJcIiAvPlxuICAgICAgPC9IZWFkPlxuICAgICAgPENvbXBvbmVudCB7Li4ucGFnZVByb3BzfSAvPlxuICAgIDwvPlxuICApO1xufVxyXG4iXSwibmFtZXMiOlsiSGVhZCIsInVzZUVmZmVjdCIsIlZJRVdQT1JUX0NPTlRFTlQiLCJNeUFwcCIsIkNvbXBvbmVudCIsInBhZ2VQcm9wcyIsImRvY3VtZW50IiwicHJldmVudFdoZWVsWm9vbSIsImV2ZW50IiwiY3RybEtleSIsIm1ldGFLZXkiLCJjYW5jZWxhYmxlIiwicHJldmVudERlZmF1bHQiLCJwcmV2ZW50S2V5Ym9hcmRab29tIiwia2V5IiwiU3RyaW5nIiwidG9Mb3dlckNhc2UiLCJjb2RlIiwiaXNab29tS2V5Iiwic3VwcG9ydHNUb3VjaCIsIndpbmRvdyIsIm5hdmlnYXRvciIsIm1heFRvdWNoUG9pbnRzIiwibWF0Y2hNZWRpYSIsIm1hdGNoZXMiLCJwcmV2ZW50R2VzdHVyZVpvb20iLCJwcmV2ZW50UGluY2hab29tIiwidG91Y2hlcyIsImxlbmd0aCIsImFkZEV2ZW50TGlzdGVuZXIiLCJwYXNzaXZlIiwicmVtb3ZlRXZlbnRMaXN0ZW5lciIsIm1ldGEiLCJuYW1lIiwiY29udGVudCIsImxpbmsiLCJyZWwiLCJocmVmIiwiY3Jvc3NPcmlnaW4iXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(pages-dir-node)/./src/pages/_app.js\n");

/***/ }),

/***/ "(pages-dir-node)/./styles/globals.css":
/*!****************************!*\
  !*** ./styles/globals.css ***!
  \****************************/
/***/ (() => {



/***/ }),

/***/ "(pages-dir-node)/./styles/styles.css":
/*!***************************!*\
  !*** ./styles/styles.css ***!
  \***************************/
/***/ (() => {



/***/ }),

/***/ "next/dist/compiled/next-server/pages.runtime.dev.js":
/*!**********************************************************************!*\
  !*** external "next/dist/compiled/next-server/pages.runtime.dev.js" ***!
  \**********************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/next-server/pages.runtime.dev.js");

/***/ }),

/***/ "react":
/*!************************!*\
  !*** external "react" ***!
  \************************/
/***/ ((module) => {

"use strict";
module.exports = require("react");

/***/ }),

/***/ "react/jsx-dev-runtime":
/*!****************************************!*\
  !*** external "react/jsx-dev-runtime" ***!
  \****************************************/
/***/ ((module) => {

"use strict";
module.exports = require("react/jsx-dev-runtime");

/***/ }),

/***/ "react/jsx-runtime":
/*!************************************!*\
  !*** external "react/jsx-runtime" ***!
  \************************************/
/***/ ((module) => {

"use strict";
module.exports = require("react/jsx-runtime");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/@swc"], () => (__webpack_exec__("(pages-dir-node)/./src/pages/_app.js")));
module.exports = __webpack_exports__;

})();