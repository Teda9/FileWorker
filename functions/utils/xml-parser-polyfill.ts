import { DOMParser as XmlDomParser } from "@xmldom/xmldom";

const workerGlobals = globalThis as unknown as {
    DOMParser?: typeof XmlDomParser;
    Node?: { ELEMENT_NODE?: number; TEXT_NODE?: number };
};

workerGlobals.DOMParser ??= XmlDomParser;

if (
    typeof workerGlobals.Node?.ELEMENT_NODE !== "number" ||
    typeof workerGlobals.Node?.TEXT_NODE !== "number"
) {
    workerGlobals.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
}
