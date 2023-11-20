const idl = require("@webref/idl");
const css = require("@webref/css");
const elements = require("@webref/elements");
const bcd = require('@mdn/browser-compat-data');
const mdn = require('./inventory.json');
const browserSpecs = require('browser-specs');
const { definitionSyntax } = require('css-tree');
const annotations = require('./annotations.json');

const gaps = {};

function setGap(spec, type, content, name, subname, props = {}) {
  if (!gaps[spec]) {
    const specData = browserSpecs.find(s => s.series.shortname === spec);
    gaps[spec] = {title: specData?.title, url: specData?.url};
  }
  if (!gaps[spec][type]) {
    gaps[spec][type] = {};
  }
  if (!gaps[spec][type][name]) {
    gaps[spec][type][name] = {};
  }
  if (!subname) {
    gaps[spec][type][name][content] = true;
  } else {
    if (gaps[spec][type][name][content] !== true) {
      if (!gaps[spec][type][name].members) {
	gaps[spec][type][name].members = {};
      }
      if (!gaps[spec][type][name].members[subname]) {
	gaps[spec][type][name].members[subname] = {...props};
      }
      gaps[spec][type][name].members[subname][content] = true;
    }
  }
}

function setBcdSupport(name, item, spec, bcdTree) {
  const ret = {"chrome": null, "firefox": null, "safari": null };
  if (bcdTree[name]) {
    const supportData = item ? bcdTree[name][item].__compat.support : bcdTree[name].__compat.support;
    // TODO: this won't work well for mobile-only feature
    for (const browserId of Object.keys(ret)) {
      const versionData = supportData[browserId];
      if (versionData.version_removed) {
	ret[browserId] = false;
      }
      const versionAdded = versionData.version_added;
      if (typeof versionAdded === "boolean") {
	ret[browserId] = versionAdded;
      } else if (!versionAdded) {
	ret[browserId] = null;
      } else {
      ret[browserId] = true;
      }
    }
  }
  if (item) {
    if (!gaps[spec]["idl"][name].members[item]) {
      gaps[spec]["idl"][name].members[item] = {};
    }
    gaps[spec]["idl"][name].members[item].bcdSupport = ret;
  } else {
    gaps[spec]["idl"][name].bcdSupport = ret;
  }
}

function checkMdnPage(tree, type, qname) {
  const root = tree.startsWith("webassembly") ? "" : "web/";
  const qnamePath = qname.replace(/\./g, '/').toLowerCase();
  if (!mdn.find(p => p.path === `/files/en-us/${root}${tree}/${type ? type + '/' : ''}${qnamePath}/index.md`)) {
    // handle cases where several definitions are handled in
    // a single page
    if (tree === "api" && annotations?.idl[qname]?.mdn) {
      return true;
    } else if (type === "element" && annotations?.markup.element[qname]?.mdn) {
      return true;
    }
    return false;
  }
  return true;
}

function checkIdlTopLevelName(name, item, spec, bcdTree) {
  // Check mdn documentation
  let hasMdnGap = false, hasBcdGap = false;
  const tree = "api";
  if (!checkMdnPage(tree, null, name)) {
    setGap(spec, "idl", "mdn", name);
    hasMdnGap = true;
  }
  if (!bcdTree[name]) {
    setGap(spec, "idl", "bcd", name);
    hasBcdGap = true;
  } else {
    if (hasMdnGap) {
      setBcdSupport(name, null, spec, bcdTree);
    }
  }
  if (hasBcdGap && hasMdnGap) return;
  // Check members
  for (let member of item.members) {
    let hasMdnGap = false, hasBcdGap = false;
    if (member.type === "const") continue;
    const type = member.type === "operation" ? "method" : member.type;
    const memberName = type === "constructor" ? name : member.name;
    if (!memberName) continue;
    // TODO check events separately
    // since event handlers don't get tracked as attributes
    if (memberName.startsWith("on") && member.type === "attribute" && member.idlType?.idlType === "EventHandler") continue;
    const isStatic = member.special === "static";
    // Check mdn documentation
    if (checkMdnPage(tree, null, name) && !checkMdnPage(tree, null, name + "." + memberName)) {
      hasMdnGap = true;
      setGap(spec, "idl", "mdn", name, memberName, {type, isStatic});
    }
    if (bcdTree[name] && !bcdTree[name][memberName]) {
      hasBcdGap = true;
      setGap(spec, "idl", "bcd", name, memberName, {type, isStatic});
    } else {
      if (hasMdnGap) {
	setBcdSupport(name, memberName, spec, bcdTree);
      }
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
      checkIdlTopLevelName(item.name, item, spec, bcd.webassembly);
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
