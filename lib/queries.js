import { sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { updateSudo as update, querySudo as query } from '@lblod/mu-auth-sudo';

const ARCHIVED_MANDATARIS_TYPE = 'http://lblod.data.gift/vocabularies/mandaat/ArchivedMandataris';
const GRAVEYARD_GRAPH = 'http://mu.semte.ch/graphs/graveyard/mandatarissen';

/**
 * Get the URI of a mandataris from its uuid.
 *
 * @param string mandatarisUuid Uuid of the mandataris
*/
async function getMandataris(mandatarisUuid) {
  const result = await query(`
    SELECT ?mandataris
    WHERE {
      GRAPH ?g {
        ?mandataris ?p ${sparqlEscapeString(mandatarisUuid)} .
      }
    }
  `);

  if (result.results.bindings.length) {
    return result.results.bindings[0]['mandataris'].value;
  } else {
    return null;
  }
}

/**
 * Move the given mandataris to a graveyard graph
 *
 * @param string mandatarisUri URI of the mandataris
*/
async function moveMandatarisToGraveyardGraph(mandatarisUri) {
  const q = `
    DELETE {
      GRAPH ?g {
        ${sparqlEscapeUri(mandatarisUri)} ?p ?o .
      }
    } INSERT {
      GRAPH ${sparqlEscapeUri(GRAVEYARD_GRAPH)} {
        ${sparqlEscapeUri(mandatarisUri)} ?p ?o .
      }
    } WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(mandatarisUri)} ?p ?o .
      }
    }
  `;

  await update(q);
}

/**
 * Updates the type of the given mandataris to the specified status
 *
 * @param string mandatarisUri URI of the mandataris
*/
async function updateMandatarisType(mandatarisUri) {
  const q = `
    DELETE {
      GRAPH ?g {
        ${sparqlEscapeUri(mandatarisUri)} a <http://data.vlaanderen.be/ns/mandaat#Mandataris> .
      }
    } INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(mandatarisUri)} a ${sparqlEscapeUri(ARCHIVED_MANDATARIS_TYPE)} .
      }
    } WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(mandatarisUri)} a <http://data.vlaanderen.be/ns/mandaat#Mandataris> .
      }
    }
  `;

  await update(q);
}

/**
 * Add a deletion reason for a given mandataris
 *
 * @param string mandatarisUri URI of the mandataris
*/
async function addArchivingReason(mandatarisUri) {
  const q = `
    INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(mandatarisUri)} <http://www.w3.org/2004/02/skos/core#historyNote> "Has been archived due to deletion in Loket." .
      }
    } WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(mandatarisUri)} a <http://data.vlaanderen.be/ns/mandaat#Mandataris> .
      }
    }
  `;

  await update(q);
}

/**
 * Checks if a mandataris is a duplicate.
 *
 * @param string mandatarisUri URI of the mandataris
*/
async function hasDuplicate(mandatarisUri) {
  const result = await query(`
    PREFIX owl: <http://www.w3.org/2002/07/owl#>

    SELECT ?duplicatedMandataris
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(mandatarisUri)} owl:sameAs ?duplicatedMandataris .
      }
    }
  `);

  if (result.results.bindings.length) {
    return result.results.bindings[0]['duplicatedMandataris'].value;
  } else {
    return false;
  }
}

/**
 * Move the duplication triples of the duplicated mandataris to a graveyard graph
 *
 * @param string duplicatedMandatarisUri URI of the duplicated mandataris
*/
async function moveDuplicationInfoTriplesToGraveyardGraph(duplicatedMandatarisUri) {
  const q = `
    PREFIX owl: <http://www.w3.org/2002/07/owl#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    DELETE {
      GRAPH ?g {
        ${sparqlEscapeUri(duplicatedMandatarisUri)} owl:sameAs ?mandataris ;
          skos:changeNote ?reason .
      }
    } INSERT {
      GRAPH ${sparqlEscapeUri(GRAVEYARD_GRAPH)} {
        ${sparqlEscapeUri(duplicatedMandatarisUri)} owl:sameAs ?mandataris ;
          skos:changeNote ?reason .
      }
    } WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(duplicatedMandatarisUri)} owl:sameAs ?mandataris .
        OPTIONAL { ${sparqlEscapeUri(duplicatedMandatarisUri)} skos:changeNote ?reason } .
      }
    }
  `;

  await update(q);
}

/**
 * Replace duplicated mandataris in triples by the correct mandataris
 *
 * @param string mandatarisUri URI of the mandataris
*/
async function updateMandatarisInRelatedTriples(mandatarisUri) {
  const q = `
    PREFIX owl: <http://www.w3.org/2002/07/owl#>

    DELETE {
      GRAPH ?g {
        ?s ?p ${sparqlEscapeUri(mandatarisUri)} .
      }
    } INSERT {
      GRAPH ?g {
        ?s ?p ?duplicatedMandataris .
      }
    } WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(mandatarisUri)} owl:sameAs ?duplicatedMandataris .
        ?s ?p ${sparqlEscapeUri(mandatarisUri)} .
      }
    }
  `;
  await update(q);
}

/**
 * Move the triples having the given mandataris as object to a graveyard graph
 *
 * @param string mandatarisUri URI of the mandataris
*/
async function moveMandatarisRelationshipsToGraveyardGraph(mandatarisUri) {
  const q = `
    DELETE {
      GRAPH ?g {
        ?s ?p ${sparqlEscapeUri(mandatarisUri)} .
      }
    } INSERT {
      GRAPH ${sparqlEscapeUri(GRAVEYARD_GRAPH)} {
        ?s ?p ${sparqlEscapeUri(mandatarisUri)} .
      }
    } WHERE {
      GRAPH ?g {
        ?s ?p ${sparqlEscapeUri(mandatarisUri)} .
      }
    }
  `;

  await update(q);
}

export {
  getMandataris,
  moveMandatarisToGraveyardGraph,
  updateMandatarisType,
  addArchivingReason,
  hasDuplicate,
  moveDuplicationInfoTriplesToGraveyardGraph,
  updateMandatarisInRelatedTriples,
  moveMandatarisRelationshipsToGraveyardGraph
}
