require('dotenv').config();

const app = require('./app');
const { warmUp } = require('./services/pythonBridge');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`CampusPulse server is running on http://localhost:${PORT}`);

  // Importing scikit-learn takes about five seconds and torch about fifteen, so both
  // Python scripts are started now rather than during the first complaint
  warmUp('predict.py');
  warmUp('cv_classify.py');
});
