import { app, errorHandler } from 'mu';
import bodyParser from 'body-parser';
import flatten from 'lodash.flatten';
import {
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
} from './lib/queries';

app.use(bodyParser.json({ type: function(req) { return /^application\/json/.test(req.get('content-type')); } }));

app.delete('/:uuid/archive', async function( req, res ) {
  const mandatarisTriples = await getMandatarisTriples(req.params.uuid);
  const mandataris = mandatarisTriples[0]['s'].value;

  if (!mandataris) {
    console.log(`Mandataris with uuid ${req.params.uuid} not found.`);
    return res.status(404).send();
  }

  try {
    const duplicatedMandataris = await hasDuplicate(mandataris);

    console.log(`Archiving mandataris ${mandataris}`);

    // If the delete works, the user has the rights to delete the mandataris.
    // We can then use sudo queries as the user has the appropriate rights on the data he's trying to process.
    const result = await deleteMandataris(mandataris);
    if (!result) {
      console.log(`The user doesn't have the rights to delete ${mandataris}`);
    }

    await copyMandatarisToGraveyardGraph(mandatarisTriples);

    await updateMandatarisType(mandataris);
    await addArchivingReason(mandataris);

    if (duplicatedMandataris) {
      console.log(`A duplicate has been found: ${duplicatedMandataris}`);
      await moveDuplicationInfoTriplesToGraveyardGraph(duplicatedMandataris)
      await updateMandatarisInRelatedTriples(mandataris);
    } else {
      console.log(`No duplicates, moving relationships to graveyard`);
      await forceCacheRefresh(mandatarisTriples);
      await moveMandatarisRelationshipsToGraveyardGraph(mandataris);
    }
  } catch (e) {
    console.log(`Something went wrong while processing mandataris ${mandataris}`);
    console.log(e);
    res.status(400).send({
      errors: [{
        title: `Something unexpected happened while archiving the mandataris ${mandataris}: ${e} `
      }]
    }).end();
  }
  return res.status(204).send();
});

app.use(errorHandler);
