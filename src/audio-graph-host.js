export function createAudioGraphHost({ AudioContextClass = globalThis.AudioContext } = {}) {
  let audioContext = null;
  const moduleNodes = new Map();

  function ensureContext() {
    if (!audioContext) {
      if (!AudioContextClass) {
        throw new Error("Web Audio is unavailable in this browser");
      }

      audioContext = new AudioContextClass();
    }

    return audioContext;
  }

  return {
    get context() {
      return audioContext;
    },

    get registeredModuleCount() {
      return moduleNodes.size;
    },

    registerModule(moduleDefinition) {
      if (moduleNodes.has(moduleDefinition.id)) {
        return moduleNodes.get(moduleDefinition.id);
      }

      let nodes = null;

      const registration = {
        moduleId: moduleDefinition.id,
        get nodes() {
          if (!nodes) {
            nodes = moduleDefinition.createAudioNodes
              ? moduleDefinition.createAudioNodes(ensureContext())
              : {};
          }

          return nodes;
        },
        ports: moduleDefinition.ports
      };

      moduleNodes.set(moduleDefinition.id, registration);
      return registration;
    },

    connect(sourceModuleId, sourceNodeName, targetModuleId, targetNodeName) {
      const sourceRegistration = moduleNodes.get(sourceModuleId);
      const targetRegistration = moduleNodes.get(targetModuleId);
      const sourceNode = sourceRegistration?.nodes[sourceNodeName];
      const targetNode = targetRegistration?.nodes[targetNodeName];

      if (!sourceNode || !targetNode) {
        throw new Error("Cannot connect missing Web Audio nodes");
      }

      sourceNode.connect(targetNode);
    }
  };
}
