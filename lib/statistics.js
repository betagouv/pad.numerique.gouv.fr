const Sequelize = require('sequelize')
const models = require('./models')
const Op = Sequelize.Op

const ONE_MONTH = 1000 * 60 * 60 * 24 * 30

function getActiveUsersForSpecificMonth (params, callback) {
  const dateInf = new Date()
  dateInf.setFullYear(params.year)
  // the Date API requires a month value between 0 and 11, whereas params contains a readable month between 1 and 12
  dateInf.setMonth(params.month - 1)
  dateInf.setDate(params.dayOfMonth)

  const dateSup = new Date()
  dateSup.setTime(dateInf.getTime() + ONE_MONTH)

  const limitDates = formatLimitDates(dateInf, dateSup)

  return models.User.count({
    where: {
      updatedAt: {
        [Op.gte]: limitDates.dateInf,
        [Op.lte]: limitDates.dateSup
      }
    }
  }).then(function (data) {
    callback({ dateInf: limitDates.dateInf, dateSup: limitDates.dateSup, activeUsers: data })
  })
}

function getActiveUsersForLastMonth (callback) {
  const dateSup = new Date()
  const dateInf = new Date()
  dateInf.setTime(dateSup.getTime() - ONE_MONTH)

  return getActiveUsersForSpecificMonth({
    year: dateInf.getFullYear(),
    // the Date API requires a month value between 0 and 11, whereas params contains a readable month between 1 and 12
    month: dateInf.getMonth() + 1,
    dayOfMonth: dateInf.getDate()
  }, callback)
}

function formatLimitDates (dateInf, dateSup) {
  const formattedMonthInf = dateInf.getMonth() + 1 < 10 ? `0${dateInf.getMonth() + 1}` : `${dateInf.getMonth() + 1}`
  const formattedMonthSup = dateSup.getMonth() + 1 < 10 ? `0${dateSup.getMonth() + 1}` : `${dateSup.getMonth() + 1}`

  const formattedDayOfMonthInf = dateInf.getDate() < 10 ? `0${dateInf.getDate()}` : `${dateInf.getDate()}`
  const formattedDayOfMonthSup = dateSup.getDate() < 10 ? `0${dateSup.getDate()}` : `${dateSup.getDate()}`

  const formattedDateInf = `${dateInf.getFullYear()}-${formattedMonthInf}-${formattedDayOfMonthInf} 00:00:00`
  const formattedDateSup = `${dateSup.getFullYear()}-${formattedMonthSup}-${formattedDayOfMonthSup} 00:00:00`
  return { dateInf: formattedDateInf, dateSup: formattedDateSup }
}

exports.getActiveUsersForSpecificMonth = getActiveUsersForSpecificMonth
exports.getActiveUsersForLastMonth = getActiveUsersForLastMonth
