const idl = require("@webref/idl");
const css = require("@webref/css");
const elements = require("@webref/elements");
const bcd = require('@mdn/browser-compat-data');
const mdn = require('./inventory.json');
const browserSpecs = require('browser-specs');
const { definitionSyntax } = require('css-tree');

const gaps = {};

function setGap(spec, type, content, name, subname) {
  if (!gaps[spec]) {
    const specData = browserSpecs.find(s => s.series.shortname === spec);
    gaps[spec] = {title: specData?.title, url: specData?.url};
  }
  if (!gaps[spec][type]) {
    gaps[spec][type] = {};
  }
  if (!gaps[spec][type][content]) {
    gaps[spec][type][content] = {};
  }

  if (!subname) {
    gaps[spec][type][content][name] = true;
  } else {
    if (gaps[spec][type][content][name] !== true) {
      if (!Array.isArray(gaps[spec][type][content][name])) {
	gaps[spec][type][content][name] = [];
      }
      if (!gaps[spec][type][content][name].includes(subname)) {
	gaps[spec][type][content][name].push(subname);
      }
    }
  }
}

function checkMdnPage(tree, type, qname) {
  const qnamePath = qname.replace(/\./g, '/').toLowerCase();
  return mdn.find(p => p.path === `/files/en-us/web/${tree}/${type ? type + '/' : ''}${qnamePath}/index.md`);
}

function checkIdlTopLevelName(name, item, spec, bcdTree) {
  // Check mdn documentation
  if (!checkMdnPage("api", null, name)) {
    setGap(spec, "idl", "mdn", name);
  }
  if (!bcdTree[name]) {
    setGap(spec, "idl", "bcd", name);
  }
  // Check members
  for (let member of item.members) {
    if (!member.name) continue;
    const memberName = member.name + ( member.type === "operation" ? "()" : "");
    if (member.type === "const") continue;
    // TODO check events separately
    // since event handlers don't get tracked as attributes
    if (member.name.startsWith("on") && member.type === "attribute" && member.idlType?.idlType === "EventHandler") continue;

    // Check mdn documentation
    if (checkMdnPage("api", null, name) && !checkMdnPage("api", null, name + "." + memberName)) {
      setGap(spec, "idl", "mdn", name, memberName);
    }
    if (bcdTree[name] && !bcdTree[name][member.name]) {
      setGap(spec, "idl", "bcd", name, memberName);
    }
  }
}

(async function() {
  const idlFiles = await idl.listAll();
  const mixins = {};
  const idlToCheck = [];
  for (const [shortname, file] of Object.entries(idlFiles)) {
    const ast = await file.parse();
    for (let item of ast) {
      if (["callback", "typedef", "dictionary", "enum"].includes(item.type)) continue;
      if (item.type === "interface mixin") {
	mixins[item.name] = {spec: shortname, item};
	continue;
      }
      idlToCheck.push({spec: shortname, item});
    }
  }
  for (let {spec, item} of idlToCheck) {
    // Exceptions for WebAssembly hierarchy
    if (item.name === "WebAssembly" && item.type === "namespace") {
      continue;
    }
    if (item.type !== "includes" && item.extAttrs?.find(e => e.name === "LegacyNamespace" && e.rhs.value === "WebAssembly")) {
      checkIdlTopLevelName(item.name, item, spec, bcd.javascript.builtins.WebAssembly);
      // TODO: members of interfaces, includes
      continue;
    }
    if (item.type === "interface" || item.type === "namespace" || item.type === "callback interface") {
      checkIdlTopLevelName(item.name, item, spec, bcd.api);
    } else if (item.type === "includes") {
      if (mixins[item.includes]) {
	checkIdlTopLevelName(item.target, mixins[item.includes].item, mixins[item.includes].spec, bcd.api);
      } else {
	console.error(`Could not find mixin ${item.includes}`);
      }
    } else {
      console.error(`Unhandled IDL: ${item.type}`);
    }
  }
  
  const parsedCssFiles = await css.listAll();
  for (const [spec, data] of Object.entries(parsedCssFiles)) {
    // TODO figure out how to check against bcd.css.types
    for (const [name, desc] of Object.entries(data.properties)) {
      // TODO check keywords definitions in MDN content?
      if (!checkMdnPage("css", null, name)) {
	setGap(spec, "css.properties", "mdn", name);
      }
      if (!bcd.css.properties[name]) {
	setGap(spec, "css.properties", "bcd", name);
      }
    }
    for (const [name, desc] of Object.entries(data.atrules)) {
      const atrulesName = name.slice(1);
      // TODO check descriptors?
      if (!checkMdnPage("css", null, name)) {
	setGap(spec, "css.atrules", "mdn", name);
      }
      if (!bcd.css["at-rules"][atrulesName]) {
	setGap(spec, "css.atrules", "bcd", name);
      }
    }

    const elementsList = await elements.listAll();
    for (let [spec, data] of Object.entries(elementsList)) {
      // We assume that other element-defining specs are module of SVG
      // WEBREF: webref doesn't collect mathml elements at the moment
      let mdnSpec = spec;
      if (!["html", "mathml-core"].includes(spec)) {
	mdnSpec = "svg";
      }
      if (spec === "mathml-core") {
	mdnSpec = "mathml";
      }
      for (const el of data.elements) {
	if (el.obsolete) continue;
	if (!checkMdnPage(mdnSpec, "element", el.name)) {
	  setGap(spec, "elements", "mdn", el.name);
	}
	if (!bcd[mdnSpec]?.elements[el.name]) {
	  setGap(spec, "elements", "bcd", el.name);
	}
	// WEBREF: Would be nice to check attributes,
	// but webref doesn't collect those at the moment
      }
    }
  }

  console.log(JSON.stringify(gaps, null, 2));
})();
