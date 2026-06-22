export function createAudioGraphHost({ AudioContextClass = globalThis.AudioContext } = {}) {
  let audioContext = null;
  const moduleNodes = new Map();
  const connections = new Map();
  let connectionId = 0;

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
      connectionId += 1;

      const id = `connection-${connectionId}`;
      connections.set(id, { sourceNode, targetNode });
      return id;
    },

    connectPorts(sourceModuleId, sourcePort, targetModuleId, targetPort) {
      if (!sourcePort.node || !targetPort.node) {
        throw new Error("Cannot connect ports without Web Audio node metadata");
      }

      return this.connect(sourceModuleId, sourcePort.node, targetModuleId, targetPort.node);
    },

    disconnect(connectionIdToRemove) {
      const connection = connections.get(connectionIdToRemove);

      if (!connection) {
        return false;
      }

      connection.sourceNode.disconnect(connection.targetNode);
      connections.delete(connectionIdToRemove);
      return true;
    }
  };
}
