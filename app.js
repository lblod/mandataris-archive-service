import { app, errorHandler } from 'mu';
import bodyParser from 'body-parser';
import flatten from 'lodash.flatten';
import {
  getMandataris,
  moveMandatarisToGraveyardGraph,
  updateMandatarisType,
  addArchivingReason,
  hasDuplicate,
  moveDuplicationInfoTriplesToGraveyardGraph,
  updateMandatarisInRelatedTriples,
  moveMandatarisRelationshipsToGraveyardGraph
} from './lib/queries';

app.use(bodyParser.json({ type: function(req) { return /^application\/json/.test(req.get('content-type')); } }));

app.delete('/:uuid/archive', async function( req, res ) {
  const mandataris = await getMandataris(req.params.uuid);
  if (!mandataris) {
    console.log(`Mandataris with uuid ${req.params.uuid} not found.`);
    return res.status(404).send();
  }

  try {
    console.log(`Archiving mandataris ${mandataris}`);
    const result = await moveMandatarisToGraveyardGraph(mandataris);
    if (!result) {
      console.log(`The user doesn't have the rights to delete ${mandataris}`);
    }
    //await updateMandatarisType(mandataris);
    //await addArchivingReason(mandataris);
    const duplicatedMandataris = await hasDuplicate(mandataris);
    if (duplicatedMandataris) {
      await moveDuplicationInfoTriplesToGraveyardGraph(duplicatedMandataris)
      await updateMandatarisInRelatedTriples(mandataris);
    } else {
      //await moveMandatarisRelationshipsToGraveyardGraph(mandataris);
    }
  } catch (e) {
    console.log(`Something went wrong while handling deltas for mandataris ${mandataris}`);
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
