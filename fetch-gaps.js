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
  if (!bcdTree[name]) {
    setGap(spec, "idl", "bcd", name);
  } else {
    // Check mdn documentation
    if (!bcdTree[name].__compat.mdn_url) {
      if (!checkMdnPage("idl", null, name)) {
	setGap(spec, "idl", "mdn", name);
      } else {
	setGap(spec, "idl", "bcd-mdn", name);
      }
    }
    // Check members
    for (let member of item.members) {
      if (!member.name) continue;
      const memberName = member.name + ( member.type === "operation" ? "()" : "");
      if (member.type === "const") continue;
      // TODO check events separately
      // since event handlers don't get tracked as attributes
      if (member.name.startsWith("on") && member.type === "attribute" && member.idlType?.idlType === "EventHandler") continue;

      if (!bcdTree[name][member.name]) {
	setGap(spec, "idl", "bcd", name, memberName);
      } else {
	// Check mdn documentation
	if (!bcdTree[name][member.name].__compat.mdn_url) {
	  if (!checkMdnPage("idl", null, name + "." + memberName)) {
	    setGap(spec, "idl", "mdn", name, memberName);
	  } else {
	    setGap(spec, "idl", "bcd-mdn", name, memberName);
	  }
	}
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
    // Exception for WebAssembly hierarchy
    if (item.type !== "includes" && item.extAttrs?.find(e => e.name === "LegacyNamesapce" && e.rhs.value === "WebAssembly")) {
      checkIdlTopLevelName(item.name, item, spec, bcd.javascript.builtins.webassembly);
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
      if (!bcd.css.properties[name]) {
	setGap(spec, "css.properties", "bcd", name);
      } else {
	if (!bcd.css.properties[name].__compat.mdn_url) {
	  if (!checkMdnPage("css", null, name)) {
	    setGap(spec, "css.properties", "mdn", name);
	  } else {
	    setGap(spec, "css.properties", "bcd-mdn");
	  }
	}
	// TODO check keywords definitions in MDN content?
      }
    }
    for (const [name, desc] of Object.entries(data.atrules)) {
      const atrulesName = name.slice(1);
      if (!bcd.css["at-rules"][atrulesName]) {
	setGap(spec, "css.atrules", "bcd", name);
      } else {
	if (!bcd.css["at-rules"][atrulesName].__compat.mdn_url) {
	  if (!checkMdnPage("css", null, name)) {
	    setGap(spec, "css.atrules", "mdn", name);
	  } else {
	    setGap(spec, "css.atrules", "bcd-mdn");
	  }
	}
	// TODO check descriptors?
      }
    }

    const elementsList = await elements.listAll();
    for (let [spec, data] of Object.entries(elementsList)) {
      // We assume that other element-defining specs are module of SVG
      // WEBREF: webref doesn't collect mathml elements at the moment
      if (!["html", "mathml-core"].includes(spec)) {
	spec = "svg";
      }
      for (const el of data.elements) {
	if (el.obsolete) continue;
	if (!bcd[spec].elements[el.name]) {
	  setGap(spec, "elements", "bcd", el.name);
	} else if (!bcd[spec].elements[el.name].__compat.mdn_url) {
	  if (!checkMdnPage(spec, "element", el.name)) {
	    setGap(spec, "elements", "mdn", el.name);
	  } else {
	    setGap(spec, "elements", "bcd-mdn");
	  }
	}
	// WEBREF: Would be nice to check attributes,
	// but webref doesn't collect those at the moment
      }
    }
  }

  console.log(JSON.stringify(gaps, null, 2));
})();
