import { sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { updateSudo as updateSudo, querySudo as querySudo } from '@lblod/mu-auth-sudo';
import { update, query } from 'mu';

const ARCHIVED_MANDATARIS_TYPE = 'http://lblod.data.gift/vocabularies/mandaat/ArchivedMandataris';
const GRAVEYARD_GRAPH = 'http://mu.semte.ch/graphs/graveyard/mandatarissen';

/**
 * Get the URI of a mandataris from its uuid.
 *
 * @param string mandatarisUuid Uuid of the mandataris
*/
async function getMandatarisTriples(mandatarisUuid) {
  const result = await query(`
    SELECT ?s ?p ?o
    WHERE {
      GRAPH ?g {
        ?s ?uuid ${sparqlEscapeString(mandatarisUuid)} ; ?p ?o .
      }
    }
  `);

  if (result.results.bindings.length) {
    return result.results.bindings;
  } else {
    return null;
  }
}

/**
 * Delete the given mandataris.
 *
 * @param string mandatarisUri URI of the mandataris
*/
async function deleteMandataris(mandatarisUri) {
  const q = `
    DELETE {
      GRAPH <http://mu.semte.ch/application> {
        ${sparqlEscapeUri(mandatarisUri)} ?p ?o .
      }
    } WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(mandatarisUri)} ?p ?o .
      }
    }
  `;

  return await update(q);
}

/**
 * Writes the given mandataris triples to a graveyard graph.
 *
 * @param string mandatarisUri URI of the mandataris
*/
async function copyMandatarisToGraveyardGraph(mandatarisTriples) {
  const q = `
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(GRAVEYARD_GRAPH)}{
        ${toStatements(mandatarisTriples)}
      }
    }
  `;
  return await updateSudo(q);
}

/**
 * Helper transforming triple objects to a string that can be used in a SPARQL query.
 *
 * @param Object triples The triples to transform
*/
function toStatements(triples) {
  const escape = function(rdfTerm) {
    const { type, value, datatype, "xml:lang":lang } = rdfTerm;
    if (type == "uri") {
      return sparqlEscapeUri(value);
    } else if (type == "literal" || type == "typed-literal") {
      if (datatype)
        return `${sparqlEscapeString(value)}^^${sparqlEscapeUri(datatype)}`;
      else if (lang)
        return `${sparqlEscapeString(value)}@${lang}`;
      else
        return `${sparqlEscapeString(value)}`;
    } else
      console.log(`Don't know how to escape type ${type}. Will escape as a string.`);
      return sparqlEscapeString(value);
  };
  return triples.map(function(t) {
    const subject = escape(t.s);
    const predicate = escape(t.p);
    const object = escape(t.o);
    return `${subject} ${predicate} ${object} . `;
  }).join('');
}

/**
 * Updates the type of the given mandataris to the specified status
 *
 * @param string mandatarisUri URI of the mandataris
*/
async function updateMandatarisType(mandatarisUri) {
  const q = `
    DELETE {
      GRAPH ${sparqlEscapeUri(GRAVEYARD_GRAPH)} {
        ${sparqlEscapeUri(mandatarisUri)} a <http://data.vlaanderen.be/ns/mandaat#Mandataris> .
      }
    } INSERT {
      GRAPH ${sparqlEscapeUri(GRAVEYARD_GRAPH)} {
        ${sparqlEscapeUri(mandatarisUri)} a ${sparqlEscapeUri(ARCHIVED_MANDATARIS_TYPE)} .
      }
    } WHERE {
      GRAPH ${sparqlEscapeUri(GRAVEYARD_GRAPH)} {
        ${sparqlEscapeUri(mandatarisUri)} a <http://data.vlaanderen.be/ns/mandaat#Mandataris> .
      }
    }
  `;

  await updateSudo(q);
}

/**
 * Add a deletion reason for a given mandataris
 *
 * @param string mandatarisUri URI of the mandataris
*/
async function addArchivingReason(mandatarisUri) {
  const q = `
    INSERT {
      GRAPH ${sparqlEscapeUri(GRAVEYARD_GRAPH)} {
        ${sparqlEscapeUri(mandatarisUri)} <http://www.w3.org/2004/02/skos/core#historyNote> "Has been archived due to deletion in Loket." .
      }
    } WHERE {
      GRAPH ${sparqlEscapeUri(GRAVEYARD_GRAPH)} {
        ${sparqlEscapeUri(mandatarisUri)} a <http://data.vlaanderen.be/ns/mandaat#Mandataris> .
      }
    }
  `;

  await updateSudo(q);
}

/**
 * Checks if a mandataris is a duplicate.
 *
 * @param string mandatarisUri URI of the mandataris
*/
async function hasDuplicate(mandatarisUri) {
  const result = await querySudo(`
    PREFIX owl: <http://www.w3.org/2002/07/owl#>

    SELECT ?duplicatedMandataris
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(mandatarisUri)} owl:sameAs ?duplicatedMandataris .
      }
      FILTER (?g NOT IN (${sparqlEscapeUri(GRAVEYARD_GRAPH)}))
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

  await updateSudo(q);
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
      FILTER (?g NOT IN (${sparqlEscapeUri(GRAVEYARD_GRAPH)}))
    }
  `;
  await updateSudo(q);
}

/**
 * This function is a hack to force the cache to refresh. Without it, the archived mandataris 
 * still appears in the frontend until the next restart of the cache service, which is not the
 * behaviour we want.
 *
 * @param string mandatarisTriples Triples representing the mandataris
*/
async function forceCacheRefresh(mandatarisTriples) {
  const personUri = mandatarisTriples.find(triple => {
    return (triple.p.value == "http://data.vlaanderen.be/ns/mandaat#isBestuurlijkeAliasVan");
  }).o.value;

  const q = `
    DELETE {
      GRAPH ?g {
        ${sparqlEscapeUri(personUri)} ?p ?o .
      }
    } INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(personUri)} ?p ?o .
      }
    } WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(personUri)} ?p ?o .
      }
    }
  `;

  await updateSudo(q);
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

  await updateSudo(q);
}

export {
  getMandatarisTriples,
  deleteMandataris,
  copyMandatarisToGraveyardGraph,
  updateMandatarisType,
  addArchivingReason,
  hasDuplicate,
  moveDuplicationInfoTriplesToGraveyardGraph,
  updateMandatarisInRelatedTriples,
  forceCacheRefresh,
  moveMandatarisRelationshipsToGraveyardGraph
}
